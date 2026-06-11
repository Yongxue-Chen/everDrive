# Bilingual User Guide Design

## Goal

Provide equivalent Simplified Chinese and English everDrive user manuals with an obvious language switch and stable existing links.

## Structure

- Keep `docs/USER_GUIDE.md` as the Simplified Chinese default so existing links remain valid.
- Add `docs/USER_GUIDE.en.md` as the English manual.
- Add `简体中文 | English` language links at the top of both manuals.
- Add explicit Chinese and English manual links to the README documentation navigation.

## Consistency

Both manuals use the same ten-section structure and describe the same implemented capabilities, API-only capabilities, safety warnings, and current limitations. English technical terms retain the same identifiers used by the application, including `archive`, `mirror`, rclone remote, business remote, and mapping task.

## Verification

Verify both manuals contain matching numbered sections, all relative links exist, language switches resolve correctly, and `git diff --check` passes.
