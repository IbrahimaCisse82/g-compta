# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Environment Base44 (aperçu sandbox)

L'environnement d'aperçu utilise un compose dédié :

```sh
docker compose -f docker-compose.base44.yml up -d --build
```

- Un seul service `web` (`oven/bun:1`), code monté depuis ce dépôt, serveur de
  développement Vite sur le port **3000** (avec rechargement à chaud).
- Les dépendances sont installées au démarrage depuis `bun.lock`
  (`package-lock.json` est obsolète) : `bun install --frozen-lockfile`.
- Aucun secret n'est nécessaire au démarrage : les valeurs `VITE_SUPABASE_*` du
  `.env` du dépôt suffisent à afficher l'application.

### Override sandbox : hôtes autorisés par Vite

Le proxy d'aperçu transmet l'en-tête `Host` sous la forme
`<port>-<sandbox id>.$BASE44_SANDBOX_HOST_DOMAIN`. Le contrôle d'hôte de Vite
répond alors `403 Blocked request` pour la page et pour tous les assets, ce qui
ressemble à un échec de démarrage alors que le serveur est sain. Vite 5.4.19
n'exploite pas `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`, donc `vite.config.ts`
ajoute `server.allowedHosts = ['.' + BASE44_SANDBOX_HOST_DOMAIN]`.

- Si `BASE44_PREVIEW_MODE === "1"` : l'hôte du sandbox est autorisé (l'identifiant
  du sandbox changeant, on utilise le joker `.domaine`).
- Sinon (variable absente ou autre valeur) : aucune modification de configuration,
  comportement d'origine conservé.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
