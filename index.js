const fs = require('fs');
const csv = require('csv-parser');
const readline = require('readline');
const similarity = require('string-similarity');
const path = require('path');

// Récupérer le chemin du fichier CSV depuis les arguments de la ligne de commande
// ou utiliser 'contacts.csv' par défaut
const csvFilePath = process.argv[2] || 'contacts.csv';

// Créer l'interface de ligne de commande
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Variables globales
let contacts = [];
let removedContacts = [];
let headers = [];
const removedIndices = new Set(); // Pour suivre les indices supprimés
const rejectedPairs = new Set(); // Pour mémoriser les paires déjà rejetées
const ignoredPhones = new Set(); // Pour mémoriser les numéros de téléphone génériques

// Fonction pour demander des informations à l'utilisateur
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function normalizeEmail(email) {
  if (!email) return '';
  
  // Prendre la partie avant le @ et après le @
  const parts = email.split('@');
  if (parts.length !== 2) return email.toLowerCase().trim();
  
  let [username, domain] = parts;
  
  // Normalisation du nom d'utilisateur
  username = username
    .toLowerCase()
    .replace(/\./g, '')     // Supprime les points
    .replace(/\+.*$/, '');  // Supprime tout après le +
  
  // Traitement du domaine (en minuscules)
  domain = domain.toLowerCase();
  
  return `${username}@${domain}`.trim();
}

function normalizePhone(phone) {
  if (!phone) return '';
  
  return phone
    .replace(/\D/g, '')     // Garde que les chiffres
    .replace(/^33/, '0')    // +33 devient 0
    .replace(/^0+/, '0')    // Un seul 0 au début
    .replace(/\s+/g, '');   // Supprime les espaces
}

function isGenericPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 8) return false;
  
  // Vérifier si le numéro contient des motifs répétitifs
  return normalized.includes('00000') || 
         normalized.includes('11111') || 
         normalized.includes('22222') ||
         normalized.includes('33333') ||
         normalized.includes('44444') ||
         normalized.includes('55555') ||
         normalized.includes('66666') ||
         normalized.includes('77777') ||
         normalized.includes('88888') ||
         normalized.includes('99999');
}

function arePhonesEqual(phone1, phone2) {
  // Si l'un des téléphones est vide, ils ne sont pas égaux
  if (!phone1 || !phone2) return false;
  
  // Si l'un des téléphones est dans la liste des téléphones ignorés, ils ne sont pas égaux
  if (ignoredPhones.has(normalizePhone(phone1)) || ignoredPhones.has(normalizePhone(phone2))) return false;
  
  // Normaliser les téléphones
  const norm1 = normalizePhone(phone1);
  const norm2 = normalizePhone(phone2);
  
  // Si les téléphones sont trop courts, ignorer
  if (norm1.length < 8 || norm2.length < 8) return false;
  
  // Compare les 8 derniers chiffres (numéro sans l'indicatif)
  const last8digits1 = norm1.slice(-8);
  const last8digits2 = norm2.slice(-8);
  
  return last8digits1 === last8digits2;
}

function compareNames(name1, name2) {
  if (!name1 || !name2) return 0;
  
  // Normalisation des noms
  const norm1 = name1.toLowerCase().trim();
  const norm2 = name2.toLowerCase().trim();
  
  // Si l'un est inclus dans l'autre ou inversement
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 0.9;
  }
  
  return similarity.compareTwoStrings(norm1, norm2);
}

function displayContact(contact, index) {
  // Vérifier si l'index est dans les indices supprimés
  if (removedIndices.has(index)) {
    return `[${index}] [SUPPRIMÉ]`;
  }
  return `[${index}] ${contact['Nom de famille'] || ''} ${contact['Prénom'] || ''} | ${contact['Email'] || ''} | ${contact['Téléphone'] || ''}`;
}

// Fonction pour sauvegarder les contacts (sans les supprimés) dans le fichier original
function saveContactsToOriginalFile() {
  // Filtrer les contacts qui n'ont pas été supprimés
  const activeContacts = contacts.filter((_, index) => !removedIndices.has(index));
  
  // Créer le contenu CSV
  let csvContent = headers.join(',') + '\n';
  
  activeContacts.forEach(contact => {
    const row = headers.map(header => {
      const value = contact[header] || '';
      // Échapper les virgules et les guillemets
      return value.includes(',') || value.includes('"') 
        ? `"${value.replace(/"/g, '""')}"` 
        : value;
    }).join(',');
    csvContent += row + '\n';
  });
  
  // Écrire dans une copie temporaire
  const backupPath = csvFilePath + '.bak';
  fs.writeFileSync(backupPath, fs.readFileSync(csvFilePath)); // Faire une sauvegarde
  
  try {
    // Écrire le nouveau contenu dans le fichier original
    fs.writeFileSync(csvFilePath, csvContent);
    console.log(`\n💾 Fichier original mis à jour, ${activeContacts.length} contacts conservés.`);
    console.log(`🔒 Une sauvegarde de l'original a été créée: ${backupPath}`);
  } catch (error) {
    console.error(`❌ ERREUR lors de l'écriture du fichier: ${error.message}`);
    console.log(`🔄 Essai d'écriture dans un nouveau fichier: contacts_nettoyés.csv`);
    fs.writeFileSync('contacts_nettoyes.csv', csvContent);
  }
  
  // Suppression de l'appel à la fonction manquante
  // Note: cette ligne causait l'erreur et a été supprimée
}

// Fonction pour ajouter un contact supprimé au fichier des doublons
function addToRemovedContactsFile(contact, reason, keepIndex) {
  const exportPath = 'doublons_supprimes.csv';
  
  // Vérifier si le fichier existe déjà
  const fileExists = fs.existsSync(exportPath);
  
  // Préparer la ligne à ajouter
  let csvLine = '';
  
  // Si le fichier n'existe pas, ajouter l'en-tête avec colonnes pour les détails du contact conservé
  if (!fileExists) {
    csvLine = headers.join(',') + ',Raison,ContactConservéIndex,ContactConservéNom,ContactConservéPrénom,ContactConservéEmail,ContactConservéTéléphone\n';
  }
  
  // Ajouter les données du contact supprimé
  const row = headers.map(header => {
    const value = contact[header] || '';
    // Échapper les virgules et les guillemets
    return value.includes(',') || value.includes('"') 
      ? `"${value.replace(/"/g, '""')}"` 
      : value;
  }).join(',');
  
  // Récupérer les informations du contact conservé
  const keepContact = contacts[keepIndex];
  const keepName = keepContact['Nom de famille'] || '';
  const keepFirstName = keepContact['Prénom'] || '';
  const keepEmail = keepContact['Email'] || '';
  const keepPhone = keepContact['Téléphone'] || '';
  
  // Échapper les valeurs du contact conservé si nécessaire
  const escapedKeepName = keepName.includes(',') || keepName.includes('"') ? `"${keepName.replace(/"/g, '""')}"` : keepName;
  const escapedKeepFirstName = keepFirstName.includes(',') || keepFirstName.includes('"') ? `"${keepFirstName.replace(/"/g, '""')}"` : keepFirstName;
  const escapedKeepEmail = keepEmail.includes(',') || keepEmail.includes('"') ? `"${keepEmail.replace(/"/g, '""')}"` : keepEmail;
  const escapedKeepPhone = keepPhone.includes(',') || keepPhone.includes('"') ? `"${keepPhone.replace(/"/g, '""')}"` : keepPhone;
  
  // Ajouter la raison et les informations du contact conservé
  csvLine += row + ',"' + reason + '",' + keepIndex + ',' + 
    escapedKeepName + ',' + 
    escapedKeepFirstName + ',' + 
    escapedKeepEmail + ',' + 
    escapedKeepPhone + '\n';
  
  // Écrire dans le fichier (en mode append)
  fs.appendFileSync(exportPath, csvLine);
  console.log(`📝 Contact supprimé ajouté au fichier ${exportPath} (comparé avec [${keepIndex}])`);
}

async function detectSimilarContacts() {
  console.log("🔍 Analyse des doublons en cours...");
  
  // Compteurs pour les statistiques
  let totalDuplicatesSuggested = 0;
  let totalDuplicatesConfirmed = 0;
  let totalIgnoredPhones = 0;
  
  // Fonction pour vérifier si un contact a été supprimé
  function isRemoved(index) {
    return removedIndices.has(index);
  }
  
  // Boucle principale pour la détection des doublons
  let i = 0;
  while (i < contacts.length) {
    // Si ce contact a été supprimé, passer au suivant
    if (isRemoved(i)) {
      i++;
      continue;
    }
    
    const c1 = contacts[i];
    const email1 = normalizeEmail(c1['Email']);
    const tel1 = normalizePhone(c1['Téléphone']);
    const nom1 = c1['Nom de famille'];
    const prenom1 = c1['Prénom'];
    
    // Si le téléphone est dans la liste des téléphones à ignorer, passer
    if (ignoredPhones.has(tel1)) {
      i++;
      continue;
    }
    
    // Afficher progression tous les 100 contacts
    if (i % 100 === 0 && i > 0) {
      console.log(`⏳ ${i}/${contacts.length} contacts analysés...`);
    }
    
    // Chercher des doublons potentiels
    let j = i + 1;
    while (j < contacts.length) {
      // Si ce contact a été supprimé, passer au suivant
      if (isRemoved(j)) {
        j++;
        continue;
      }
      
      const c2 = contacts[j];
      const email2 = normalizeEmail(c2['Email']);
      const tel2 = normalizePhone(c2['Téléphone']);
      const nom2 = c2['Nom de famille'];
      const prenom2 = c2['Prénom'];
      
      // Vérifier si cette paire a déjà été rejetée
      const pairKey = `${i}-${j}`;
      if (rejectedPairs.has(pairKey)) {
        j++;
        continue;
      }
      
      // Vérifier si l'un des téléphones est générique
      const phone1IsGeneric = isGenericPhone(tel1);
      const phone2IsGeneric = isGenericPhone(tel2);
      
      // Vérification des emails
      let emailScore = 0;
      if (email1 && email2) {
        // Correspondance exacte après normalisation
        if (email1 === email2) {
          emailScore = 1;
        } else {
          // Vérification de similarité pour les emails différents
          emailScore = similarity.compareTwoStrings(email1, email2);
        }
      }
      
      // Vérification des téléphones (ignorer les téléphones génériques)
      const isTelDuplicate = !phone1IsGeneric && !phone2IsGeneric && arePhonesEqual(c1['Téléphone'], c2['Téléphone']);
      
      // Vérification des noms - être plus strict ici pour éviter les faux positifs
      const nomScore = compareNames(nom1, nom2);
      const prenomScore = compareNames(prenom1, prenom2);
      
      // Critères de détection des doublons
      const isEmailDuplicate = emailScore > 0.9; // Plus strict
      const isNameDuplicate = nomScore > 0.85 && prenomScore > 0.85;
      
      // Il faut au moins une correspondance forte (email ou téléphone) ou les deux noms très similaires
      if (isEmailDuplicate || isTelDuplicate || isNameDuplicate) {
        totalDuplicatesSuggested++;
        
        console.log('\n❗ Doublon potentiel :');
        console.log(displayContact(c1, i));
        console.log(displayContact(c2, j));
        
        const reason = [];
        if (isEmailDuplicate) {
          if (emailScore === 1) {
            reason.push('Email identique après normalisation');
          } else {
            reason.push(`Email similaire (${(emailScore * 100).toFixed(0)}%)`);
          }
        }
        if (isTelDuplicate) reason.push('Téléphone identique');
        if (isNameDuplicate) reason.push(`Nom/Prénom similaire (${(nomScore * 100).toFixed(0)}%/${(prenomScore * 100).toFixed(0)}%)`);
        
        const reasonText = reason.join(' + ');
        console.log(`🔍 Raison : ${reasonText}`);
        
        // Si le téléphone est générique, proposer de l'ignorer
        if (phone1IsGeneric || phone2IsGeneric) {
          const phoneToIgnore = phone1IsGeneric ? tel1 : tel2;
          console.log(`⚠️ ATTENTION: Le téléphone "${phoneToIgnore}" semble être générique.`);
          const ignoreAnswer = await ask('Voulez-vous ignorer ce numéro pour la détection des doublons? (y/n) : ');
          
          if (ignoreAnswer.toLowerCase() === 'y') {
            const normalizedPhone = normalizePhone(phoneToIgnore);
            ignoredPhones.add(normalizedPhone);
            totalIgnoredPhones++;
            console.log(`✅ Numéro ignoré: ${phoneToIgnore}`);
            // Marquer cette paire comme rejetée
            rejectedPairs.add(pairKey);
            j++;
            continue;
          }
        }
        
        // Demander confirmation pour considérer comme doublon
        const answer = await ask('👉 Considérer comme doublon ? (y/n) : ');
        
        if (answer.toLowerCase() === 'y') {
          totalDuplicatesConfirmed++;
          
          // Demander quel contact conserver
          let keepIndex = i; // Par défaut, on garde le premier
          let removeIndex = j; // Par défaut, on supprime le second
          
          const keepAnswer = await ask('Souhaitez-vous choisir quel contact conserver? (y/n) : ');
          if (keepAnswer.toLowerCase() === 'y') {
            const choice = await ask(`Entrez 1 pour garder [${i}] ou 2 pour garder [${j}] : `);
            if (choice === '2') {
              keepIndex = j;
              removeIndex = i;
            }
          }
          
          // Marquer le contact comme supprimé
          removedIndices.add(removeIndex);
          
          // Ajouter aux contacts supprimés
          removedContacts.push({
            contact: contacts[removeIndex],
            reason: reasonText,
            keepIndex: keepIndex
          });
          
          // Ajouter immédiatement au fichier des doublons supprimés
          addToRemovedContactsFile(contacts[removeIndex], reasonText, keepIndex);
          
          console.log(`✅ Contact [${removeIndex}] marqué comme supprimé.`);
          
          // Sauvegarder immédiatement après chaque suppression
          console.log('💾 Mise à jour du fichier CSV...');
          saveContactsToOriginalFile();
          
          // Si on a supprimé le contact courant, il faut réajuster l'indice
          if (removeIndex === i) {
            // Pas besoin d'incrémenter i, on va réanalyser avec le même i
            // mais on sort de la boucle interne
            break;
          }
        } else {
          // Ajouter à la liste des paires rejetées
          rejectedPairs.add(pairKey);
        }
      }
      
      j++;
    }
    
    i++;
  }
  
  // Sauvegarder à la fin si nécessaire
  if (removedContacts.length > 0) {
    // Les sauvegardes sont déjà faites en temps réel après chaque suppression
    console.log("\n✅ Toutes les modifications ont été enregistrées en temps réel.");
    console.log(`📊 ${removedContacts.length} contacts ont été supprimés et enregistrés dans 'doublons_supprimes.csv'`);
  }
  
  // Afficher les statistiques finales
  console.log(`\n✨ Analyse terminée.`);
  console.log(`📊 Statistiques:`);
  console.log(`  - ${totalDuplicatesSuggested} doublons potentiels suggérés`);
  console.log(`  - ${totalDuplicatesConfirmed} doublons confirmés et supprimés`);
  console.log(`  - ${totalIgnoredPhones} numéros de téléphone ignorés`);
  console.log(`  - ${contacts.length - removedIndices.size} contacts restants`);
  
  // Fermer l'interface
  rl.close();
}

// Fonction pour charger les contacts
function loadContacts(filePath) {
  contacts = [];
  
  fs.createReadStream(filePath)
    .on('error', (error) => {
      console.error(`❌ ERREUR lors de la lecture du fichier: ${error.message}`);
      rl.close();
    })
    .pipe(csv())
    .on('data', (data) => contacts.push(data))
    .on('end', () => {
      if (contacts.length === 0) {
        console.error('❌ ERREUR: Le fichier CSV ne contient aucune donnée ou n\'est pas au format attendu.');
        rl.close();
        return;
      }
      
      // Sauvegarder les en-têtes
      headers = Object.keys(contacts[0]);
      
      // Vérifier la structure des données
      const firstContact = contacts[0];
      const hasEmail = 'Email' in firstContact;
      const hasTelephone = 'Téléphone' in firstContact;
      const hasNom = 'Nom de famille' in firstContact;
      const hasPrenom = 'Prénom' in firstContact;
      
      console.log(`📁 ${contacts.length} contacts chargés.`);
      console.log(`Colonnes détectées: ${headers.join(', ')}\n`);
      
      // Vérifier si les colonnes requises sont présentes
      if (!hasEmail && !hasTelephone) {
        console.error('❌ ERREUR: Le fichier CSV doit contenir au moins une colonne "Email" ou "Téléphone".');
        rl.close();
        return;
      }
      
      if (!hasNom || !hasPrenom) {
        console.log('⚠️ ATTENTION: Les colonnes "Nom de famille" et/ou "Prénom" sont absentes ou mal nommées.');
      }
      
      detectSimilarContacts();
    });
}

// Fonction principale
async function main() {
  console.log(`🔍 Outil de détection et suppression de doublons dans les contacts`);
  console.log(`=============================================================\n`);
  
  // Vérifier si le fichier existe
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ ERREUR: Le fichier "${csvFilePath}" n'existe pas.`);
    console.log(`\nUtilisation: node script.js [chemin_vers_fichier.csv]`);
    console.log(`\nExemples:`);
    console.log(`  node script.js`);
    console.log(`  node script.js mes_contacts.csv`);
    console.log(`  node script.js "C:\\Chemin\\Vers\\Fichier.csv"`);
    
    // Demander à l'utilisateur de spécifier le fichier
    const newPath = await ask('\n👉 Veuillez entrer le chemin complet du fichier CSV: ');
    
    if (!fs.existsSync(newPath)) {
      console.error(`❌ ERREUR: Le fichier "${newPath}" n'existe pas non plus. Fin du programme.`);
      rl.close();
      return;
    }
    
    console.log(`✅ Fichier trouvé! Chargement de "${newPath}"...\n`);
    loadContacts(newPath);
  } else {
    console.log(`✅ Fichier trouvé! Chargement de "${csvFilePath}"...\n`);
    loadContacts(csvFilePath);
  }
}

// Démarrer le programme
main();