# VSCode Beginner's Guide - Telegram Bridge Development

This guide explains everything you need to know to work on this project in VSCode, even if you're brand new.

## Part 1: Opening the Project in VSCode

### Step 1: Open VSCode
1. Click the VSCode icon in your Applications folder (or dock)
2. You should see a welcome screen

### Step 2: Open the Project Folder
1. In VSCode menu, click **File** → **Open Folder**
2. Navigate to: `/Users/mac/Projects/hfsp-labs-colosseum-dev`
3. Click **Open** button

You should now see the project structure on the left side (the file tree).

### Step 3: Check You're in the Right Place
Look at the top of VSCode. You should see:
```
hfsp-labs-colosseum-dev
```

This means you've opened the correct folder.

## Part 2: Understanding the Project Structure

### Left Sidebar (File Tree)

When you open the folder, you'll see a tree structure on the left:

```
📁 hfsp-labs-colosseum-dev
 ├── 📁 packages
 │   └── 📁 agent-provisioning
 │       └── 📁 services
 │           └── 📁 telegram-bot          ← This is what we created
 │               ├── 📁 src
 │               │   ├── 📁 handlers
 │               │   ├── 📁 services
 │               │   ├── 📁 types
 │               │   ├── 📁 utils
 │               │   └── index.ts
 │               ├── 📁 deployment
 │               ├── package.json
 │               ├── tsconfig.json
 │               ├── Dockerfile
 │               └── docker-compose.yml
 ├── .claude
 │   └── context.md                      ← Read this first!
 └── ... other files
```

### Tips for Navigation
- Click the **📁** (folder icon) to expand/collapse folders
- Click any file to open it in the editor
- Use **Ctrl+P** (Mac: **Cmd+P**) to quickly search for files by name

## Part 3: Terminal Basics in VSCode

### Opening the Terminal
1. At the top menu, click **Terminal** → **New Terminal**
2. You'll see a black box open at the bottom of VSCode
3. This is where you'll run commands

### Understanding the Terminal
```
mac@MacBook-Pro hfsp-labs-colosseum-dev % 
```

- `mac` = your username
- `MacBook-Pro` = your computer name
- `hfsp-labs-colosseum-dev` = current folder
- `%` = ready for a command

### Running Commands in Terminal
Type any command and press **Enter**. For example:
```bash
git status
```

This will show you the current state of the project.

## Part 4: Working with Git Branches

### What is a Branch?

Think of branches like:
- **main** = The "finished" version
- **feature/openai/webhook-handler** = Your work area (doesn't affect main)

You work in your branch, then merge it back to main when done.

### Viewing Current Branch

Look at the **bottom left** of VSCode:

```
┌─────────────────────────────────────┐
│ feature/claude/telegram-bot-core    │  ← This shows current branch
├─────────────────────────────────────┤
```

If you see a branch name, that's the one you're working on.

### Switching Branches

#### Method 1: Using VSCode (Easiest)
1. Click the branch name in the **bottom left** corner
2. A dropdown appears with all branches
3. Click the branch you want to switch to
4. Wait a few seconds for VSCode to load

#### Method 2: Using Terminal
1. Open the terminal (Terminal → New Terminal)
2. Type:
```bash
git checkout feature/openai/webhook-handler
```
3. Press Enter
4. Wait for it to complete

The bottom left should now show the new branch name.

## Part 5: Setting Up Your Development Environment

### Step 1: Install Dependencies

Once you've switched to your branch, you need to install the project's dependencies.

**In Terminal:**
```bash
cd packages/agent-provisioning/services/telegram-bot
npm install
```

What this does:
- `cd` = change directory (navigate to the folder)
- `npm install` = downloads all the required libraries

This takes 1-2 minutes. Wait for it to finish (you'll see `added XX packages`).

### Step 2: Check Installation Worked

Run this command:
```bash
npm run build
```

This should complete without errors. You should see:
```
Successfully compiled X files
```

## Part 6: Understanding Your Task

### Finding Your Task Assignment

Open `.claude/context.md`:
1. In the file tree on the left, expand `.claude` folder
2. Click on `context.md`
3. Read the section for your LLM assignment (OpenAI, Gemini, or Kimi)

### Example: OpenAI Task

```
### OpenAI (Webhook Handler)
**Branch**: `feature/openai/webhook-handler`
**Files to Create**:
- `src/index.ts` - Express server + webhook endpoint
- `src/handlers/message.ts` - Message parsing & routing
- `src/utils/logger.ts` - Structured logging
- `src/utils/telegram-security.ts` - Signature validation
```

This tells you:
- Which branch to work on
- Which files to edit
- What each file should do

## Part 7: Editing Code Files

### Opening a File

In the file tree (left side), navigate to the file:
1. Click the folder to expand it
2. Click the file name to open it
3. It appears in the editor (center)

### Example: Open `src/index.ts`

Path:
```
telegram-bot → src → index.ts
```

### Editing the File

1. Click in the editor area
2. Start typing (your code goes here)
3. The file is automatically saved (look for a white dot if unsaved)

### File Status Indicators

In the file tree, you'll see:
- **White dot** = File has unsaved changes
- **No dot** = File is saved
- **X** = File has been deleted locally

## Part 8: Running Your Code

### Development Mode (Testing)

In Terminal, inside the telegram-bot directory:
```bash
npm run dev
```

This starts the server and watches for changes. You'll see:
```
✓ Server running on port 3335
```

To stop it, press **Ctrl+C** (Mac: **Cmd+C**) in the terminal.

### Building for Production

```bash
npm run build
```

This creates a `dist` folder with compiled code.

## Part 9: Git Commits (Saving Your Work)

### What is a Commit?

A commit is like a "save point" in your code. It records:
- What you changed
- When you changed it
- Why you changed it (commit message)

### Making a Commit

#### Step 1: View Changes
Click the **Source Control** icon on the left (looks like a branch):

You'll see all files you've changed listed under "Changes".

#### Step 2: Stage Files
1. Hover over a changed file
2. Click the **+** icon to "stage" it
3. The file moves to "Staged Changes"

Or click **+** next to "Changes" to stage all.

#### Step 3: Write Commit Message

In the text box that says "Message", type:
```
[OPENAI] Implement webhook server and message parsing

- Added Express server listening on port 3335
- Implemented POST /webhook endpoint
- Added Telegram signature validation
- Created message parsing handler
```

#### Step 4: Commit

Click the **✓** (checkmark) button, or press **Ctrl+Enter** (Mac: **Cmd+Enter**).

Your changes are now saved in a commit!

### Example Commit Messages

Good:
```
[OPENAI] Implement webhook handler
- Added Express server
- Added signature validation
```

Bad:
```
fix bug
```

Use the format from `context.md`:
- `[OPENAI]` for webhook work
- `[GEMINI]` for agent integration
- `[KIMI]` for Docker work
- `[CLAUDE]` for orchestration

## Part 10: Pushing Your Work (Sending to Server)

### What is Push?

Push = Upload your commits to GitHub so others can see them.

### How to Push

1. In the Source Control panel (left side)
2. Click **...** (three dots) at the top
3. Click **Push**

Or in Terminal:
```bash
git push origin feature/openai/webhook-handler
```

(Replace with your actual branch name)

## Part 11: Creating a Pull Request (PR)

### What is a PR?

A PR is a request to merge your code into the main branch. It's how you ask for review.

### Steps to Create PR

#### Method 1: GitHub Website (Easiest)
1. Go to https://github.com/hfsp-labs/colosseum-dev
2. You'll see a notification: "Compare & pull request"
3. Click that button
4. Add a description of your changes
5. Click "Create Pull Request"

#### Method 2: GitHub CLI (Terminal)
```bash
gh pr create --title "[OPENAI] Implement webhook handler" \
  --body "Implemented Express server, webhook endpoint, and message parsing"
```

## Part 12: Example Workflow - From Start to Finish

### Scenario: You're implementing the webhook handler (OpenAI)

#### Step 1: Switch to Your Branch
```bash
git checkout feature/openai/webhook-handler
```

Check bottom left shows: `feature/openai/webhook-handler`

#### Step 2: Install Dependencies
```bash
cd packages/agent-provisioning/services/telegram-bot
npm install
```

#### Step 3: Open the File to Edit
- File tree → `telegram-bot` → `src` → `index.ts`
- Click it to open in editor

#### Step 4: Read the Context
- Open `.claude/context.md`
- Find the OpenAI section
- Understand what `src/index.ts` should do

#### Step 5: Write Code
Click in the editor and start typing:

```typescript
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3335;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhook', (req, res) => {
  console.log('Webhook received:', req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
```

#### Step 6: Test Your Code
In Terminal:
```bash
npm run dev
```

You should see:
```
Server running on port 3335
```

#### Step 7: Save Your Work (Commit)
1. Click Source Control icon (left)
2. Click **+** to stage all changes
3. Type commit message:
```
[OPENAI] Implement Express webhook server

- Added Express server on port 3335
- Added /health endpoint
- Added /webhook POST endpoint
- Added basic logging
```
4. Click **✓** to commit

#### Step 8: Push to GitHub
In Terminal:
```bash
git push origin feature/openai/webhook-handler
```

#### Step 9: Create Pull Request
1. Go to GitHub: https://github.com/hfsp-labs/colosseum-dev
2. Click "Compare & pull request"
3. Add description
4. Click "Create Pull Request"

#### Step 10: Wait for Review
Claude will review your PR and merge it when approved!

## Part 13: Useful VSCode Keyboard Shortcuts

### Navigation
- **Cmd+P** = Quick file search (type filename)
- **Cmd+Shift+F** = Search all files for text
- **Cmd+B** = Toggle file tree (left sidebar)
- **Cmd+J** = Toggle terminal (bottom)

### Editing
- **Cmd+/** = Comment/uncomment code
- **Cmd+S** = Save file
- **Cmd+Z** = Undo
- **Cmd+Shift+Z** = Redo
- **Cmd+X** = Cut
- **Cmd+C** = Copy
- **Cmd+V** = Paste

### Git
- **Cmd+Shift+G** = Open Source Control
- **Cmd+Shift+P** → type "Git: Commit" = Quick commit

## Part 14: Debugging Tips

### Issue: "npm: command not found"
**Solution**: Install Node.js from https://nodejs.org/ (LTS version)

### Issue: Terminal says "permission denied"
**Solution**: You're in the wrong folder. Type:
```bash
pwd
```

This shows your current location. You should be in:
```
/Users/mac/Projects/hfsp-labs-colosseum-dev/packages/agent-provisioning/services/telegram-bot
```

### Issue: Can't see my changes in Git
**Solution**: 
1. Make sure you saved the file (look for white dot)
2. Click Source Control icon
3. Sometimes VSCode takes a second to refresh

### Issue: "Already up to date" when pushing
**Solution**: That's normal! It means there are no new changes to push.

### Issue: Merge conflict
**Solution**: Ask Claude! Merge conflicts are advanced. Don't try to fix alone.

## Part 15: Getting Help

### Inside VSCode
- **Cmd+Shift+P** = Command palette (type what you want to do)
- Hover over errors = See what's wrong
- Red squiggly lines = Errors you need to fix

### Ask in Chat
If stuck, tell me:
1. What you were trying to do
2. The error message (copy-paste)
3. What file you're working on

## Part 16: Summary - Quick Reference

| Task | How To |
|------|--------|
| Open project | File → Open Folder → select `hfsp-labs-colosseum-dev` |
| Switch branch | Click branch name (bottom left) → select branch |
| Install dependencies | `npm install` in terminal |
| Run code | `npm run dev` in terminal |
| Build for production | `npm run build` in terminal |
| Make a commit | Source Control → Stage → Message → ✓ |
| Push to GitHub | `git push origin branch-name` in terminal |
| Create PR | Go to GitHub.com → "Compare & pull request" |
| Test code | Terminal with `npm run dev` then open http://localhost:3335 |

---

## Next Steps

1. ✅ Open VSCode
2. ✅ Open the project folder
3. ✅ Read `.claude/context.md` to find your task
4. ✅ Switch to your branch
5. ✅ Run `npm install`
6. ✅ Start coding!

Good luck! You've got this! 🚀
