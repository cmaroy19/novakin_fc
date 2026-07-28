# Documentation de déploiement — NOVAKIN FC

## 1. Architecture

L'app **NOVAKIN FC** est une application Frappe personnalisée (gestion administrative, sportive et financière du club) installée par-dessus Frappe + ERPNext, déployée via Docker.

| Élément | Valeur |
|---|---|
| Repo GitHub | `cmaroy19/novakin_fc`, branche `16` |
| Site production | `novakin.borafoot.com` |
| Serveur cible | `borafoot@vmi3009702` (IP `156.67.80.66`), dossier `/opt/novakin-erpnext` |
| Image Docker | `novakin/erpnext:v16-novakin` |
| Container backend | `novakin-erpnext-backend-1` |
| Fichier compose | `compose.novakin.yaml` |
| Frappe / ERPNext | branche `version-16` |
| Contenu app | 13 DocTypes, 5 rapports, 1 workspace, 17 number cards, 6 client scripts |

L'app apparaît comme **app autonome** dans le launcher grâce au hook `add_to_apps_screen` dans `hooks.py`.

## 2. Prérequis

Accès SSH au serveur cible (`borafoot@156.67.80.66` — root est bloqué pour la sécurité). Le dossier `/opt/novakin-erpnext` doit contenir `images/custom/Containerfile`, `apps.json` et `compose.novakin.yaml`. Le fichier `apps.json` pointe vers le repo `novakin_fc` sur la branche `16`. Un PAT GitHub (saisi manuellement) est nécessaire si le repo est privé.

## 3. Construction de l'image

Le hook `add_to_apps_screen` doit d'abord être présent et **actif** (non commenté) dans `novakin_fc/hooks.py` sur la branche `16` du repo.

Puis, depuis `/opt/novakin-erpnext`, on construit l'image. Le `CACHE_BUST` force la récupération du dernier commit GitHub :

```bash
cd /opt/novakin-erpnext
docker build --build-arg=FRAPPE_PATH=https://github.com/frappe/frappe --build-arg=FRAPPE_BRANCH=version-16 --build-arg=CACHE_BUST=$(date +%s) --secret id=apps_json,src=apps.json --no-cache-filter=builder --tag=novakin/erpnext:v16-novakin --file=images/custom/Containerfile .
```

## 4. Vérification de l'image (AVANT toute bascule)

Étape critique — ne jamais basculer la production sans avoir vérifié l'image dans un container éphémère :

```bash
docker run --rm novakin/erpnext:v16-novakin bash -c 'echo "=== APPS ==="; ls apps; echo "=== HOOK ==="; grep -n -A6 "add_to_apps_screen" apps/novakin_fc/novakin_fc/hooks.py | head -12; echo "=== modules.txt ==="; cat apps/novakin_fc/novakin_fc/modules.txt'
```

On attend : 3 apps (`erpnext`, `frappe`, `novakin_fc`), le hook `add_to_apps_screen` actif (non commenté), et `modules.txt` = `NOVAKIN FC`.

## 5. Déploiement / bascule en production

Backup obligatoire avant toute opération à risque :

```bash
docker exec -i novakin-erpnext-backend-1 bench --site novakin.borafoot.com backup
```

Recréation des containers sur la nouvelle image (court downtime — prévenir les utilisateurs) :

```bash
docker compose -f compose.novakin.yaml up -d --force-recreate --pull never --no-build
```

Les flags sont importants : `--force-recreate` force la prise en compte de la nouvelle version du tag, `--pull never --no-build` empêchent tout pull/rebuild (l'image est locale uniquement).

Puis application de la config :

```bash
docker exec -i novakin-erpnext-backend-1 bench --site novakin.borafoot.com clear-cache
docker exec -i novakin-erpnext-backend-1 bench --site novakin.borafoot.com migrate
```

## 6. Vérification post-déploiement

Ouvrir `https://novakin.borafoot.com/app/novakin-fc` avec un hard reload (Ctrl+Shift+R) et confirmer visuellement le dashboard. Vérifier ensuite que l'app est bien autonome dans le launcher via la console navigateur : `frappe.boot.app_data.map(a => a.app_name)` doit contenir `frappe`, `erpnext` et `novakin_fc`.

## 7. Transfert de données (migration ponctuelle, pas à chaque déploiement)

Les données ne sont PAS des fixtures : elles se transfèrent séparément. Export depuis la source vers `/tmp/novakin_data.json`, transfert par SCP (en tirant depuis la cible), puis `docker cp` dans le container, et import avec `ignore_links=True` pour contourner les champs Link absents. Pour un record refusé par une validation (ex. valeur de champ Select obsolète), forcer avec `db_insert()`. Toujours vérifier les compteurs source vs cible à la fin (objectif : correspondance exacte).

## 8. Rollback

En cas de problème, restaurer le backup pris à l'étape 5 :

```bash
docker exec -i novakin-erpnext-backend-1 bench --site novakin.borafoot.com --force restore <chemin_backup>-database.sql.gz
```

Les backups sont dans `sites/novakin.borafoot.com/private/backups/`.

## 9. Pièges & leçons apprises

- **`docker exec -i` obligatoire** pour piper un script (heredoc) dans le container. Sans le `-i`, stdin n'est pas transmis et le script échoue silencieusement.
- **Les boucles multi-lignes dans `bench console` sont avalées** par le prompt interactif. Pour du code Python avec boucles/impressions, écrire une fonction dans un fichier `.py` de l'app et l'exécuter via `bench execute mon_app.mon_module.ma_fonction`.
- **`--pull never` indispensable** au `docker compose up` car l'image est locale (sinon « pull access denied »).
- **Ne JAMAIS lancer `bench migrate` si les fichiers `.json` des DocTypes ne sont pas sur disque** — le migrate supprimerait les DocTypes comme orphelins. Ici c'est sûr car ils sont dans l'image.
- **Le hook doit être dans l'image** (pas juste édité à chaud dans le container), sinon il disparaît au prochain redéploiement.
- **Décalage de structure possible entre source et cible** (ex. options d'un champ Select qui diffèrent) : penser à normaliser les valeurs après import.
