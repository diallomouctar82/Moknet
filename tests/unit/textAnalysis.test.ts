import { describe, it, expect } from 'vitest';
import { assessText } from '../../services/meeting/uncertainty';
import { parseWorkspaceCommand } from '../../services/meeting/commandParser';

describe('signalement des informations incertaines', () => {
  it('repère les hésitations en français, anglais et espagnol', () => {
    expect(assessText('Livraison à vérifier avec le fournisseur').uncertain).toBe(true);
    expect(assessText('Le coût sera peut-être plus élevé').uncertain).toBe(true);
    expect(assessText('Delivery is probably next week').uncertain).toBe(true);
    expect(assessText('Quizás el lunes').uncertain).toBe(true);
    expect(assessText('Around 500 units').uncertain).toBe(true);
    expect(assessText('Prix ~ 2000').uncertain).toBe(true);
  });
  it('ne signale pas une information ferme', () => {
    const a = assessText('Le chantier démarre lundi 14 octobre.');
    expect(a.uncertain).toBe(false);
    expect(assessText('We talked about the budget').uncertain).toBe(false);
    expect(assessText('Environnement de test validé').uncertain).toBe(false);
  });
  it('signale un calcul faux et un nombre ambigu', () => {
    expect(assessText('Total : 3 x 1500 = 4000').reasons.join(' ')).toContain('Calcul faux');
    expect(assessText('Prévoir 1,500 tonnes').reasons.join(' ')).toContain('ambigu');
  });
  it('signale ce qui vient d\'un expert IA tant que personne ne l\'a confirmé', () => {
    expect(assessText('Décision ferme', { aiGenerated: true }).reasons.join(' ')).toContain('expert IA');
  });
});

describe('commandes vocales ou écrites sur l\'espace partagé', () => {
  const ctx = { participantNames: ['Moussa D.', 'Aminata K.', 'Jean-Pierre M.'], columnNames: ['Article', 'Quantité', 'Prix'] };

  it('ajoute une décision (fr, en, es)', () => {
    expect(parseWorkspaceCommand('Décision : on commande le ciment chez Kaloum', ctx)).toEqual({ kind: 'add', section: 'decisions', text: 'on commande le ciment chez Kaloum' });
    expect(parseWorkspaceCommand('We decided that the site opens Monday', ctx)).toMatchObject({ kind: 'add', section: 'decisions', text: 'the site opens Monday' });
    expect(parseWorkspaceCommand('Decisión: abrir el lunes', ctx)).toMatchObject({ kind: 'add', section: 'decisions', text: 'abrir el lunes' });
    // Une phrase naturelle n'est pas amputée de son verbe.
    expect(parseWorkspaceCommand('On a décidé de commencer lundi.', ctx)).toMatchObject({ kind: 'add', section: 'decisions', text: 'On a décidé de commencer lundi' });
    expect(parseWorkspaceCommand('On a décidé que le chantier ouvre lundi', ctx)).toMatchObject({ text: 'le chantier ouvre lundi' });
  });
  it('ajoute une action avec responsable et échéance', () => {
    expect(parseWorkspaceCommand('Action : envoyer le devis pour Aminata avant vendredi', ctx))
      .toEqual({ kind: 'add', section: 'actions', text: 'envoyer le devis', owner: 'Aminata K.', due: 'vendredi' });
    expect(parseWorkspaceCommand('Task: book the truck @Jean-Pierre M. by Friday', ctx))
      .toEqual({ kind: 'add', section: 'actions', text: 'book the truck', owner: 'Jean-Pierre M.', due: 'Friday' });
  });
  it('ajoute une ligne de tableau sans casser les décimales', () => {
    expect(parseWorkspaceCommand('Ligne : Sable ; 2 ; 750,50', ctx)).toEqual({ kind: 'row', values: ['Sable', '2', '750,50'] });
    expect(parseWorkspaceCommand('row: Iron, 4, 12.5', ctx)).toEqual({ kind: 'row', values: ['Iron', '4', '12.5'] });
  });
  it('corrige et supprime', () => {
    expect(parseWorkspaceCommand('Corrige décision 2 : on commande chez Matoto', ctx)).toEqual({ kind: 'edit', section: 'decisions', index: 2, text: 'on commande chez Matoto' });
    expect(parseWorkspaceCommand('corrige ligne 1 quantité 4', ctx)).toEqual({ kind: 'cell', index: 1, column: 'Quantité', value: '4' });
    expect(parseWorkspaceCommand('supprime action 3', ctx)).toEqual({ kind: 'delete', section: 'actions', index: 3 });
    expect(parseWorkspaceCommand('delete row 2', ctx)).toEqual({ kind: 'delete_row', index: 2 });
  });
  it('ne devine pas une phrase non reconnue', () => {
    expect(parseWorkspaceCommand('Bonjour à tous', ctx)).toBeNull();
  });
  it('reconnaît des mots-clés entiers, au pluriel compris', () => {
    expect(parseWorkspaceCommand('Décisions : acheter le ciment', ctx)).toMatchObject({ section: 'decisions', text: 'acheter le ciment' });
    expect(parseWorkspaceCommand('Actions: call the bank', ctx)).toMatchObject({ section: 'actions', text: 'call the bank' });
    expect(parseWorkspaceCommand('Tasks: call the bank', ctx)).toMatchObject({ section: 'actions', text: 'call the bank' });
    expect(parseWorkspaceCommand('Resumen: todo bien', ctx)).toMatchObject({ section: 'recap', text: 'todo bien' });
    expect(parseWorkspaceCommand('Actionnaires présents : 5', ctx)).toBeNull();
    expect(parseWorkspaceCommand('Notez que la salle change', ctx)).toBeNull();
    expect(parseWorkspaceCommand('Rowan will call', ctx)).toBeNull();
  });
  it('en lecture de transcription, exige « : » après le mot-clé', () => {
    const strict = { ...ctx, strict: true };
    expect(parseWorkspaceCommand('Action plan was discussed', strict)).toBeNull();
    expect(parseWorkspaceCommand('Action : réserver le camion', strict)).toMatchObject({ section: 'actions' });
  });
  it('retient la dernière échéance de la phrase', () => {
    expect(parseWorkspaceCommand('Action : confirm by phone before Friday', ctx)).toMatchObject({ text: 'confirm by phone', due: 'Friday' });
    expect(parseWorkspaceCommand("Action : payer d'ici à jeudi", ctx)).toMatchObject({ text: 'payer', due: 'jeudi' });
  });
});
