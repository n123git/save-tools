# save-tools
Vanilla JS Save tools for the Yo-kai Watch Franchise. For documentation on the save system (including inner workings and data point locations), please look at [save-docs](n123git.github.io/save-docs) - and finally if you have any questions, requests or bug reports feel free to open an issue, pull request or DM me on discord (@n123original). These are **entirely** script-based so they can be used in `Node.js` projects if needed.  [note: include minimum ES version for use]. Usage Examples can be found in comments at the top of the scripts.

## Tool 1: Encryption Manager
- Used for **Yo-kai Watch 1**, **Yo-kai Watch 2** and **Yo-kai Watch Blasters**.
- Functionality:
  - Checks version encryption (needed for **Yo-kai Watch 2** as encryption varies for v1 vs v2 saves) - an secondary, experimental header metadata parsing method is also provided although it **cannot** guarantee complete accuracy without further research.
    - Also has a header mode to tell if something is a valid *decrypted* `head.yw` for **Yo-kai Watch 2** and **Yo-kai Watch Blasters**.
  - Base Encryption
    - Used for **Yo-kai Watch 1** saves, and **Yo-kai Watch 2** + **Yo-kai Watch Blasters** header files (`head.yw`).
  - Advanced Encryption
    - Used for **Yo-kai Watch 2** saves (and Blasters saves?).
    - Requires a header file for Blasters saves and V2 **Yo-kai Watch 2** saves.

### Dependencies:
- **[SJCL](https://github.com/bitwiseshiftleft/sjcl)**, also known as Stanford Javascript Crypto Library. 
  - The Lib *is* included with the appropriate license - props to them (I originally handled AES-CCM myself but I couldn't guarantee there would be no implementation bugs).

## Tool 2: SectionParser
- Used for **Yo-kai Watch 2**, and **Yo-kai Watch Blasters**.
- Functionality:
  - Safely parses and validates section trees exporting as JSON.
  - Example Output: [lorem ipsum dolar sit amet]
 
## Tool 3: Data Manager
- Contains (YW2) data for Section Tags (Meanings of each ID), ID Data for everything from ParamIDs to locationIDs to equipped wallpapers and contact menu data.

## Supported Games
| Tool / Game            | Yo-kai Watch 1                                                                      | Yo-kai Watch 2                                                 | Yo-kai Watch Blasters                                              |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Encryption Manager** | ✅ (Base Encryption)                                                                | ✅ (Base + Advanced Encryption, version check)                | ⚠️ (Base + Advanced Encryption, header always required)           |
| **SectionParser**      | ❌ (Isn't needed as the game uses direct offsets)                                   | ✅ (Uses section parsing for header and save files).          | ✅ (Uses section parsing for header and save files).              |
| **Data Manager**       | ⚠️ (Some overlap but full support is not currently available).                      | ✅ (Full Support).                                            | ⚠️ (Some overlap but full support is not currently available). |

Key:
- ✅ for support.
- ⚠️ for partial support or untested (but likely support).
- ❌ for unsupported or untested AND unlikely.
