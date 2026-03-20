---
name: Preserve GitHub integration and LLM config
description: Do not remove or reset the GitHub integration or the LLM tenant default configuration during builds
type: feedback
---

Do not remove or reset the GitHub integration or the LLM configuration with tenant default assignment.

**Why:** The user manually configured these through the UI and wants them persisted across future builds/restarts until they explicitly remove them.

**How to apply:** When modifying demo_setup.py, bootstrap code, or integration/LLM config stores, do not overwrite or clear existing GitHub integrations or LLM assignments. This is in addition to the existing rule about preserving ServiceNow endpoint configs.
