# Component Category Icons Implementation Plan

## Scope

Add 26 standalone 32 × 32 SVG files under `client/src/assets/component-icons/`, one for every ID in `shared/src/categories.ts`. Do not import the assets or alter client behavior.

## Steps

1. Create the icon asset directory and author an outlined SVG for each category.
2. Apply the common asset contract to every file: 32 × 32 dimensions, `viewBox="0 0 32 32"`, `currentColor` strokes, and rounded 2 px line work.
3. Use specific geometry for drivetrain, wheel, cockpit, and seating components; add compact `F`/`R` labels to the front/rear wheel and tire assets.
4. Add a lightweight Node validation script that compares icon filenames with `CATEGORIES` and checks each asset’s shared SVG contract.
5. Run the asset validator and the repository verification gate; inspect rendered SVG contact sheet to confirm legibility at 32 px.
6. Commit, push, and update the existing draft pull request.
