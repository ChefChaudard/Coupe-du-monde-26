-- Migration Supabase
-- Objectif : aligner le comportement local/prod
-- - recalcul automatique des points
-- - date simulée utilisée comme date applicative
-- - blocage des pronostics après coup d'envoi
-- - blocage des scores réels avant fin estimée du match

BEGIN;

-- =====================================================
-- 1. Réglage applicatif : date simulée
-- =====================================================

ALTER TABLE public.app_settings
ADD CONSTRAINT IF NOT EXISTS app_settings_key_unique UNIQUE (key);

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('simulated_date', '2026-05-06T13:35:00.000Z', now())
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();


-- =====================================================
-- 2. Fonction utilitaire : date courante applicative
-- =====================================================

CREATE OR REPLACE FUNCTION public.current_app_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT value::timestamptz
      FROM public.app_settings
      WHERE key = 'simulated_date'
      LIMIT 1
    ),
    now()
  );
$$;


-- =====================================================
-- 3. Fonction de recalcul des scores
-- Règle : score exact = 3 pts, bon résultat = 1 pt
-- =====================================================

CREATE OR REPLACE FUNCTION public.recalculate_scores()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.user_scores;

  INSERT INTO public.user_scores (
    user_id,
    points,
    updated_at
  )
  SELECT
    pr.user_id,
    SUM(
      CASE
        WHEN pr.predicted_a = m.score_a
         AND pr.predicted_b = m.score_b
        THEN 3

        WHEN sign(pr.predicted_a - pr.predicted_b)
           = sign(m.score_a - m.score_b)
        THEN 1

        ELSE 0
      END
    ) AS points,
    now()
  FROM public.predictions pr
  JOIN public.matches m
    ON m.id = pr.match_id
  WHERE m.is_finished = true
    AND m.score_a IS NOT NULL
    AND m.score_b IS NOT NULL
  GROUP BY pr.user_id;
END;
$$;


-- =====================================================
-- 4. Trigger de recalcul automatique des scores
-- =====================================================

CREATE OR REPLACE FUNCTION public.trigger_recalculate_scores()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.recalculate_scores();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_predictions_recalculate ON public.predictions;
DROP TRIGGER IF EXISTS trg_matches_recalculate ON public.matches;

CREATE TRIGGER trg_predictions_recalculate
AFTER INSERT OR UPDATE OR DELETE
ON public.predictions
FOR EACH STATEMENT
EXECUTE FUNCTION public.trigger_recalculate_scores();

CREATE TRIGGER trg_matches_recalculate
AFTER UPDATE OF score_a, score_b, is_finished
ON public.matches
FOR EACH STATEMENT
EXECUTE FUNCTION public.trigger_recalculate_scores();


-- =====================================================
-- 5. Blocage des pronostics après coup d'envoi
-- =====================================================

CREATE OR REPLACE FUNCTION public.prevent_late_predictions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  match_kickoff timestamptz;
BEGIN
  SELECT kickoff_at
  INTO match_kickoff
  FROM public.matches
  WHERE id = NEW.match_id;

  IF match_kickoff IS NULL THEN
    RAISE EXCEPTION 'Pronostic impossible : match introuvable.';
  END IF;

  IF public.current_app_time() >= match_kickoff THEN
    RAISE EXCEPTION 'Pronostic impossible : le match a déjà commencé.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_late_predictions ON public.predictions;

CREATE TRIGGER trg_prevent_late_predictions
BEFORE INSERT OR UPDATE OF predicted_a, predicted_b
ON public.predictions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_late_predictions();


-- =====================================================
-- 6. Blocage des scores réels avant fin estimée du match
-- Hypothèse : fin du match = kickoff + 2 heures
-- =====================================================

CREATE OR REPLACE FUNCTION public.prevent_early_real_scores()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.score_a IS DISTINCT FROM OLD.score_a
    OR NEW.score_b IS DISTINCT FROM OLD.score_b
    OR NEW.is_finished IS DISTINCT FROM OLD.is_finished
  )
  AND public.current_app_time() < NEW.kickoff_at + interval '2 hours'
  THEN
    RAISE EXCEPTION 'Score réel impossible : le match n''est pas encore terminé.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_early_real_scores ON public.matches;

CREATE TRIGGER trg_prevent_early_real_scores
BEFORE UPDATE OF score_a, score_b, is_finished
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.prevent_early_real_scores();


-- =====================================================
-- 7. Recalcul initial
-- =====================================================

SELECT public.recalculate_scores();

COMMIT;
