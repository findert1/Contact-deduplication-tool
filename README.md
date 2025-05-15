# Détection de doublons dans un fichier CSV

Ce script permet d’analyser un fichier CSV de contacts afin de **détecter les doublons potentiels**. Il identifie les entrées similaires selon plusieurs critères, et laisse toujours la décision finale à l'utilisateur.

---

## Prérequis

Avant d’exécuter le script, assurez-vous d’avoir **Node.js** installé, puis installez les dépendances suivantes :

```bash
npm install csv-parser string-similarity
```

Les modules utilisés sont :

* `fs` (inclus dans Node.js) : gestion des fichiers
* `path` (inclus dans Node.js) : manipulation des chemins
* `readline` (inclus dans Node.js) : interface CLI
* `csv-parser` : lecture des fichiers CSV
* `string-similarity` : comparaison approximative de chaînes

---

## Fonctionnalités

Le script identifie les doublons suspects à partir de :

* La similarité des **prénoms et noms**
* La similarité des **adresses e-mail** (avec normalisation, ex. : `prenom.nom+test@gmail.com`)
* La ressemblance entre **adresses e-mail proches** (ex. : `salut@exemple.com` et `sa.lut@exemple.com`)
* La similarité des **numéros de téléphone** (format +33, 0..., etc.)

Aucune correspondance n’est considérée comme certaine : chaque cas est soumis à validation manuelle.

---

## Exemple de fichier CSV

```csv
Nom de famille,Prénom,Email,Téléphone
heron,ADELE,adele.hrn@fakemail.test,01 02 03 04 05
GEAWHARI,ADIL,adil.gwr@dummy.net,06 00 00 00 01
BETTINGER,AGNES,agnes.btg@noemail.fake,06 00 00 00 02
DELBART,AIME,aime.dlb@exemple.org,06 00 00 00 03
Bercovici,ALAIN,alain.bcv@placeholder.dev,06 00 00 00 04
CHANAL JALAMION,ALAIN,alain.cj@fauxmail.xyz,06 00 00 00 05
```

---

## Lancer le script

```bash
node script.js contacts.csv
```

Si aucun fichier n'est précisé, `contacts.csv` sera utilisé par défaut.
En cas d'erreur, un chemin peut être demandé à l'utilisateur via l'interface.

---

## Traitement des doublons

Pour chaque doublon suspect, le script affiche les deux lignes et propose :

1. Est-ce un doublon ? (`y/n`)
2. Si oui, voulez-vous choisir le contact à garder ? (`y/n`)
3. La suppression est appliquée, et le contact supprimé est enregistré.

---

## Sauvegarde

* Le fichier original est mis à jour, et une sauvegarde `.bak` est créée automatiquement.
* Les contacts supprimés sont enregistrés dans le fichier `doublons_supprimes.csv`.

---

# Duplicate Detection in a CSV File

This script analyzes a CSV file to detect **potential duplicate contacts**. It highlights suspicious entries based on several criteria, but leaves the final decision to the user.

---

## Requirements

Before running, make sure you have **Node.js** installed, and install the dependencies:

```bash
npm install csv-parser string-similarity
```

Modules used:

* `fs`, `path`, `readline` (built-in Node.js modules)
* `csv-parser`: to parse CSV files
* `string-similarity`: to compare names and emails

---

## Features

The script flags possible duplicates based on:

* Similar **first and last names**
* Similar **email addresses** (e.g. `john.doe+test@gmail.com` normalized)
* Close matches (e.g. `salut@example.com` vs `sa.lut@example.com`)
* Similar **phone numbers** (+33, 0..., and formatting handled)

These matches are not strict. Each case is submitted to the user for confirmation.

---

## Sample CSV File

```csv
Last Name,First Name,Email,Phone
heron,ADELE,adele.hrn@fakemail.test,01 02 03 04 05
GEAWHARI,ADIL,adil.gwr@dummy.net,06 00 00 00 01
BETTINGER,AGNES,agnes.btg@noemail.fake,06 00 00 00 02
DELBART,AIME,aime.dlb@exemple.org,06 00 00 00 03
Bercovici,ALAIN,alain.bcv@placeholder.dev,06 00 00 00 04
CHANAL JALAMION,ALAIN,alain.cj@fauxmail.xyz,06 00 00 00 05
```

---

## Run the script

```bash
node script.js contacts.csv
```

If no file is provided, it defaults to `contacts.csv`.
You’ll be prompted to enter a path if the file is not found.

---

## Duplicate resolution process

1. Is this a duplicate? (`y/n`)
2. If yes, do you want to choose which one to keep? (`y/n`)
3. One entry is deleted, and logged.

---

## Output and backups

* The original file is updated with a backup saved as `.bak`
* Removed entries are stored in `doublons_supprimes.csv`

