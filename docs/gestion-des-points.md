# Gestion des points de la competition

## Objectif
Chaque pronostic rapporte des points uniquement si le vainqueur, le nul ou la défaite a ete correctement anticipe. Le montant final depend ensuite du poids de la phase et de la cote du scenario predit.

## Regle de calcul
Pour chaque match termine :

$$
Points = Base_{phase} \times Cote_{issue}
$$

Si l'issue du pronostic ne correspond pas au resultat reel, le score est nul.

Pour les phases de groupes, un bonus supplementaire est ajoute lorsque le classement final d'une equipe correspond au rang predit.

$$
Bonus_{classement} = Base_{groupe} 	imes Cote_{rang}
$$

La cote du rang correspond au nombre total de participants au groupe divise par le nombre de participants ayant predit cette equipe a ce rang.
Le bonus n'est applique que lorsque tous les matchs du groupe sont termines.

## Base par phase
- Phase de groupes: $1$
- 32e de finale: $1$
- 16e de finale, 8e de finale, quarts: $2$
- Demi-finales et finale: $3$
- Vainqueur: $4$

## Cotes des tours eliminatoires
Pour les pronostics des tours eliminatoires, la cote de base du site reste :

$$
Cote_{site} = \frac{Nombre\ total\ de\ joueurs}{Nombre\ de\ joueurs\ ayant\ pronostique\ l\'equipe\ dans\ la\ phase}
$$

On applique ensuite un coefficient de phase a cette cote de base.

- 16e de finale: $2$
- 8e de finale: $2$
- Quarts de finale: $3$
- Demi-finales: $3$
- Finale: $3$

Le pronostic du vainqueur est conserve dans le bracket, mais il n'entre pas dans le calcul des points.

## Cote de l'issue
La cote est calculee a partir de la repartition des pronostics sur un match donne.

- Victoire equipe A
- Match nul
- Victoire equipe B

Plus une issue est peu pronostiquee, plus sa cote est elevee.

## Formule operationnelle
1. On verifie que le match est termine.
2. On determine l'issue pronostiquee et l'issue reelle.
3. Si elles differrent, le score du pronostic vaut $0$.
4. Si elles correspondent, on applique la formule :

$$
Score = \max(1, \text{arrondi}(Base_{phase} \times Cote_{issue}, 2))
$$

Pour les tours eliminatoires, on utilise donc :

$$
Cote_{issue} = Cote_{site} \times Coef_{phase}
$$

avec $Coef_{phase} = 2$ pour les 16e et les 8e, puis $Coef_{phase} = 3$ pour les quarts, les demis et la finale.

## Principe de classement
Le classement live est la somme des points de tous les pronostics valides d'un utilisateur.

- Le classement global additionne tous les points.
- Le detail par phase ventile les points entre groupes, tours eliminatoires et pronostics reels.
- Les groupes incluent aussi un bonus de classement final pour chaque equipe bien placee.
- Le classement se recalcule a partir des donnees courantes des matchs et des pronostics, pas a partir d'un score pre-calculé figé.

## Exemple
Si un match de quarts vaut une base de $2$ et que la cote de la victoire pronostiquee est $1.75$, alors le gain est :

$$
2 \times 1.75 = 3.5 \text{ points}
$$

Si le pronostic est incorrect, le gain est $0$.
