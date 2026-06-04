alter table if exists public.matches
add column if not exists city text;

update public.matches as m
set city = v.city
from (
  values
    ($$Mexique$$, $$Corée du Sud$$, $$Guadalajara$$),
    ($$Mexique$$, $$Afrique du Sud$$, $$Mexico City$$),
    ($$Mexique$$, $$Tchéquie$$, $$Mexico City$$),
    ($$Tchéquie$$, $$Corée du Sud$$, $$Guadalajara$$),
    ($$Tchéquie$$, $$Afrique du Sud$$, $$Atlanta$$),
    ($$Afrique du Sud$$, $$Corée du Sud$$, $$Monterrey$$),

    ($$Canada$$, $$Suisse$$, $$Vancouver$$),
    ($$Canada$$, $$Qatar$$, $$Vancouver$$),
    ($$Canada$$, $$Bosnie-Herzégovine$$, $$Toronto$$),
    ($$Bosnie-Herzégovine$$, $$Suisse$$, $$Seattle$$),
    ($$Bosnie-Herzégovine$$, $$Qatar$$, $$Seattle$$),
    ($$Qatar$$, $$Suisse$$, $$San Francisco Bay Area$$),

    ($$Brésil$$, $$Maroc$$, $$New Jersey$$),
    ($$Brésil$$, $$Écosse$$, $$Boston$$),
    ($$Brésil$$, $$Haïti$$, $$Philadelphia$$),
    ($$Haïti$$, $$Maroc$$, $$Atlanta$$),
    ($$Haïti$$, $$Écosse$$, $$Boston$$),
    ($$Écosse$$, $$Maroc$$, $$Boston$$),

    ($$USA$$, $$Australie$$, $$Seattle$$),
    ($$USA$$, $$Paraguay$$, $$Los Angeles$$),
    ($$USA$$, $$Türkiye$$, $$Los Angeles$$),
    ($$Türkiye$$, $$Australie$$, $$San Francisco Bay Area$$),
    ($$Türkiye$$, $$Paraguay$$, $$San Francisco Bay Area$$),
    ($$Paraguay$$, $$Australie$$, $$San Francisco Bay Area$$),

    ($$Allemagne$$, $$Équateur$$, $$Toronto$$),
    ($$Allemagne$$, $$Côte d'Ivoire$$, $$Toronto$$),
    ($$Allemagne$$, $$Curaçao$$, $$Houston$$),
    ($$Curaçao$$, $$Équateur$$, $$Kansas City$$),
    ($$Curaçao$$, $$Côte d'Ivoire$$, $$Philadelphia$$),
    ($$Côte d'Ivoire$$, $$Équateur$$, $$Philadelphia$$),

    ($$Pays-Bas$$, $$Japon$$, $$Dallas$$),
    ($$Pays-Bas$$, $$Tunisie$$, $$Kansas City$$),
    ($$Pays-Bas$$, $$Suède$$, $$Houston$$),
    ($$Suède$$, $$Japon$$, $$Monterrey$$),
    ($$Suède$$, $$Tunisie$$, $$Monterrey$$),
    ($$Tunisie$$, $$Japon$$, $$Monterrey$$),

    ($$Belgique$$, $$Iran$$, $$Los Angeles$$),
    ($$Belgique$$, $$Égypte$$, $$Seattle$$),
    ($$Belgique$$, $$Nouvelle-Zélande$$, $$Vancouver$$),
    ($$Nouvelle-Zélande$$, $$Iran$$, $$Los Angeles$$),
    ($$Nouvelle-Zélande$$, $$Égypte$$, $$Vancouver$$),
    ($$Égypte$$, $$Iran$$, $$Seattle$$),

    ($$Espagne$$, $$Uruguay$$, $$Miami$$),
    ($$Espagne$$, $$Arabie Saoudite$$, $$Atlanta$$),
    ($$Espagne$$, $$Cabo Verde$$, $$Atlanta$$),
    ($$Cabo Verde$$, $$Uruguay$$, $$Miami$$),
    ($$Cabo Verde$$, $$Arabie Saoudite$$, $$Houston$$),
    ($$Arabie Saoudite$$, $$Uruguay$$, $$Miami$$),

    ($$France$$, $$Sénégal$$, $$New Jersey$$),
    ($$France$$, $$Norvège$$, $$Boston$$),
    ($$France$$, $$Irak$$, $$Philadelphia$$),
    ($$Irak$$, $$Sénégal$$, $$Toronto$$),
    ($$Irak$$, $$Norvège$$, $$Boston$$),
    ($$Norvège$$, $$Sénégal$$, $$New Jersey$$),

    ($$Argentine$$, $$Autriche$$, $$Dallas$$),
    ($$Argentine$$, $$Algérie$$, $$Kansas City$$),
    ($$Argentine$$, $$Jordanie$$, $$Dallas$$),
    ($$Jordanie$$, $$Autriche$$, $$San Francisco Bay Area$$),
    ($$Jordanie$$, $$Algérie$$, $$San Francisco Bay Area$$),
    ($$Algérie$$, $$Autriche$$, $$Kansas City$$),

    ($$Portugal$$, $$Colombie$$, $$Houston$$),
    ($$Portugal$$, $$Ouzbékistan$$, $$Houston$$),
    ($$Portugal$$, $$Congo DR$$, $$Houston$$),
    ($$Congo DR$$, $$Colombie$$, $$Guadalajara$$),
    ($$Congo DR$$, $$Ouzbékistan$$, $$Atlanta$$),
    ($$Ouzbékistan$$, $$Colombie$$, $$Guadalajara$$),

    ($$Angleterre$$, $$Croatie$$, $$Dallas$$),
    ($$Angleterre$$, $$Panama$$, $$New Jersey$$),
    ($$Angleterre$$, $$Ghana$$, $$Boston$$),
    ($$Ghana$$, $$Croatie$$, $$Philadelphia$$),
    ($$Ghana$$, $$Panama$$, $$Toronto$$),
    ($$Panama$$, $$Croatie$$, $$Toronto$$)
) as v(team_a, team_b, city)
where m.phase ilike $$Groupe%$$
  and ((m.team_a = v.team_a and m.team_b = v.team_b) or (m.team_a = v.team_b and m.team_b = v.team_a));