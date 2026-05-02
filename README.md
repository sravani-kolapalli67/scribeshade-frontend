# Craft Vita

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)


Please enter a password to protect the secret key.
Password: 

Password (one more time): 

Deriving a key from the password in order to encrypt the secret key... done

Your keypair was generated successfully:
Private: D:\ScribeShade\scribeshade-01-frontend\~\.tauri\craftvita.key (Keep it secret!)
Public: D:\ScribeShade\scribeshade-01-frontend\~\.tauri\craftvita.key.pub
---------------------------

Environment variables used to sign:
- `TAURI_SIGNING_PRIVATE_KEY`: String of your private key
- `TAURI_SIGNING_PRIVATE_KEY_PATH`: Path to your private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`:  Your private key password (optional if key has no password)

ATTENTION: If you lose your private key OR password, you'll not be able to sign your update package and updates will not work

D:\ScribeShade\scribeshade-01-frontend>


# 1. Bump version (on main branch)
./bump-version.sh patch       # or minor / major

# 2. Commit + push to release branch
git add . && git commit -m "release: v$(node -p \"require('./package.json').version\")"
git push origin release       # ← triggers the action