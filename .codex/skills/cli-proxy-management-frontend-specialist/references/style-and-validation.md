# Style And Validation

## Style cues

- This is an operations console, not a generic promo site.
- Hierarchy should help scanning dense data and controls quickly.
- Favor clearer grouping, spacing, and state treatment over decorative complexity.
- Reuse existing SCSS variables and layout primitives before adding new tokens.

## Validation

Use the narrowest commands that still give confidence:

```bash
npm run type-check
npm run build
```

If a task is purely presentational and you skip one of the commands, mention that explicitly in the handoff.

