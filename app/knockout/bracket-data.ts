export type Round16Teams = [string, string][];

// CL26 : 8 qualifies directs de la phase de ligue (rangs 1-8) contre les 8
// vainqueurs des barrages aller-retour (rangs 9-24). Le tirage reel de
// l'UEFA n'est pas une formule fixe (contrairement au bracket WC26 issu des
// groupes) : ces libelles ne sont que des espaces reserves tant que les
// vrais noms d'equipes ne sont pas connus (cf. round16Teams, passe en prop
// une fois le tirage ou les barrages resolus).
export const round16Placeholders: Round16Teams = [
  ["Qualifie direct 1", "Vainqueur barrage 8"],
  ["Qualifie direct 2", "Vainqueur barrage 7"],
  ["Qualifie direct 3", "Vainqueur barrage 6"],
  ["Qualifie direct 4", "Vainqueur barrage 5"],
  ["Qualifie direct 5", "Vainqueur barrage 4"],
  ["Qualifie direct 6", "Vainqueur barrage 3"],
  ["Qualifie direct 7", "Vainqueur barrage 2"],
  ["Qualifie direct 8", "Vainqueur barrage 1"],
];