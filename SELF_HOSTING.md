# Running Vaquill for Word yourself

This guide walks you through running the community edition of the Vaquill Word add-in on your own, with your own AI key.
No Vaquill account is needed.
It assumes you can install software and run a few commands, but not that you are a developer.
Every step is spelled out.

## What you are setting up

The add-in is a small web app that runs inside Word.
"Sideloading" means telling Word to load your copy of it, instead of getting it from the Office store.
You do three things: install the tools, start the app, and tell Word to load it.
After that, opening Word shows a Vaquill button.

There are two ways to run it.
Pick one.

- Option A: on your own computer.
  Best for trying it, or for a single person.
  The app runs on your machine while you use it.
- Option B: on a server for your firm.
  Best for a team.
  The app runs on a server, so everyone can use it without keeping anything open.

Start with Option A.

## Before you start (both options)

1. Install Node.js.
   Go to https://nodejs.org and install the version labeled "LTS".
   This adds the `node` and `npm` commands used below.
2. Have Microsoft Word.
   Word on Windows, Word on Mac, or Word on the web (in a browser) all work.
3. Get an AI key (you will paste it into the add-in later, not now).
   Create one at https://platform.openai.com/api-keys (OpenAI) or at https://console.anthropic.com/settings/keys (Anthropic).
4. Download the code.
   Open a terminal.
   On Mac that is the Terminal app; on Windows it is PowerShell.
   Run these three lines, one at a time:
   ```
   git clone https://github.com/Vaquill-AI/vaquill-word-addin.git
   cd vaquill-word-addin
   npm install
   ```
   The first line downloads the code.
   The second moves into the downloaded folder.
   The third downloads what the app needs, and takes a couple of minutes.
   You only do this once.

## Option A: run it on your own computer

### Step 1. Trust a local certificate (one time)

Word only loads add-ins served securely (over HTTPS), even on your own machine.
This command creates and trusts a certificate so that works:
```
npx office-addin-dev-certs install
```
If your computer asks for permission, say yes.
You only do this once.

### Step 2. Start the app

```
npm run dev:community
```
Leave this terminal window open while you use the add-in.
It is now serving the app at https://localhost:3000.
To stop it later, click that window and press Ctrl+C.

### Step 3. Tell Word to load it

Do the part for your version of Word.
The file you point Word at is `manifest.localhost.xml`, in the project folder you downloaded.

**Word on the web (simplest):**
1. Open Word in your browser at https://www.office.com and open any document.
2. On the Home tab, click Add-ins (on some versions it is under Insert, then Add-ins).
3. Click "Upload My Add-in".
4. Choose the file `manifest.localhost.xml` from the project folder.
5. Click Upload.

**Word on Mac:**
1. Open Finder.
2. Press Cmd+Shift+G, paste the line below, and press Enter:
   ```
   ~/Library/Containers/com.microsoft.Word/Data/Documents/wef
   ```
   If there is no folder named `wef`, create one there.
3. Copy `manifest.localhost.xml` into that `wef` folder.
4. Quit Word completely and reopen it.
5. Open a document, go to the Home tab, click Add-ins, then My Add-ins, and pick Vaquill under "Developer Add-ins".

**Word on Windows:**
1. Make a folder anywhere, for example `C:\vaquill-addin`, and copy `manifest.localhost.xml` into it.
2. Right-click that folder, choose Properties, open the Sharing tab, click Share, and share it with yourself.
   Copy the network path Windows shows (it looks like `\\YOUR-PC\vaquill-addin`).
3. Open Word.
   Go to File, then Options, then Trust Center, then Trust Center Settings, then Trusted Add-in Catalogs.
4. Paste the network path into "Catalog Url", click Add Catalog, tick "Show in Menu", and click OK.
5. Close Word and reopen it.
6. On the Home tab, click Add-ins, open the "Shared Folder" tab, and pick Vaquill.

### Step 4. Open it and add your key

1. On the Home tab, click "Open Vaquill".
   The pane opens on the right.
2. The first time, it asks for your AI provider and key.
   Choose OpenAI or Anthropic, paste your key, and click Test.
3. When it shows "Working", click Save.
   That is it.
   Your key stays on your computer and is only sent to the provider you chose.

## Option B: run it on a server for your firm

Use this when you want the add-in available to a team, without anyone keeping a terminal open.

### Step 1. Build the app
```
npm run build:community
```
This creates a `dist` folder.
That folder is the whole app, as plain files.

### Step 2. Put `dist` on a web server with HTTPS
Copy everything inside `dist` to any web server that serves it over HTTPS on a web address you control, for example `https://vaquill.yourfirm.com`.
Any static hosting works: your own server, an internal web server, or a static host.
HTTPS is required (a plain http address will not load in Word).

### Step 3. Make your manifest
1. Make a copy of `manifest.community.xml` and name it, for example, `manifest.firm.xml`.
2. Open it in a text editor and replace every `YOUR-DOMAIN.example.com` with your address (for example `vaquill.yourfirm.com`).
3. Replace the line that starts with `<Id>` with a new unique id.
   You can create one at https://guidgenerator.com and paste it between `<Id>` and `</Id>`.

### Step 4. Give it to your team
Send `manifest.firm.xml` to each person.
Each person loads it using the matching steps in Option A, Step 3 (Word on the web, Mac, or Windows).
Then each person adds their own AI key, as in Option A, Step 4.

## What works, and what needs a Vaquill account

Most of the product works with just your key: the assistant, drafting, contract review and redlines, playbooks, NDA triage, the clause and prompt libraries, and all the document tools (formatting, defined terms, cross-references, clean copy, and so on).
See [COMMUNITY.md](COMMUNITY.md) for the full list.

Two things need a Vaquill AI account and are not in the community edition:
- Statute verification (checking a cited statute against a statute database).
- Saving work back into the hosted Vaquill product (matters, vendors, usage).

Case-law verification (does a cited case exist) is available if you add your own free CourtListener token in Settings.
Get one at https://www.courtlistener.com/help/api/rest/.

## Updating to a newer version
In the project folder, run:
```
git pull
npm install
```
Then, for Option A, start it again with `npm run dev:community`.
For Option B, run `npm run build:community` and copy the new `dist` to your server.

## If something does not work
- The pane is blank or will not load.
  Make sure the app is running.
  For Option A, the window running `npm run dev:community` must still be open, and you must have run `npx office-addin-dev-certs install`.
- Word says it cannot load the add-in.
  Close Word completely and reopen it after sideloading.
- A feature says it needs a Vaquill AI account.
  That feature uses Vaquill's hosted data and is not part of the community edition.
- The citation check says nothing happens.
  Add a free CourtListener token in Settings, under "Case-law verification".
  Case citations are checked against CourtListener; statutes are not checked in this edition.
- Attaching a PDF reference does not work.
  This edition reads `.docx`, `.txt`, and `.md` files.
  Save a PDF as `.docx` first, or paste its text.
