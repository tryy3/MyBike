# Component Category Icon Set Design

## Goal

Create standalone SVG assets for every fixed bike component category so they are ready for a later UI integration. This change does not alter application behavior or render the icons in the client.

## Asset contract

- Create one SVG for each of the 26 IDs in `shared/src/categories.ts`.
- Place each asset in `client/src/assets/component-icons/<category-id>.svg`.
- Every asset uses `width="32"`, `height="32"`, and `viewBox="0 0 32 32"`.
- Icons use `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, and `stroke-linejoin="round"` so consuming UI controls their color.
- Use fills only for small details that materially improve recognition at 32 × 32.

## Visual language

The set combines Lucide-like outlined geometry with mechanical detail when it is necessary to distinguish bicycle parts. Each icon remains legible at its native 32 × 32 size and avoids decoration that does not identify the component.

Where two categories are otherwise visually ambiguous, front and rear assets include compact `F` or `R` position markers. This applies to front/rear wheels and front/rear tires. Rear-derailleur geometry identifies its placement without a badge.

## Category coverage

The set includes:

`frame`, `fork`, `headset`, `handlebar`, `stem`, `bar-tape`, `shift-levers`, `brake-levers`, `front-derailleur`, `rear-derailleur`, `crankset`, `bottom-bracket`, `cassette`, `chain`, `brakes`, `front-wheel`, `rear-wheel`, `hubs`, `rims`, `spokes`, `front-tire`, `rear-tire`, `saddle`, `seatpost`, `pedals`, and `other`.

## Recognition strategy

- Drivetrain icons use teeth, linked chain segments, and derailleur cage/pulley details.
- Wheel-system icons distinguish rims, hubs, spokes, wheels, and tires by their ring structure, hub/spoke pattern, or tire tread.
- Cockpit icons distinguish bars, tape/grips, stems, and levers by their silhouette and attachment geometry.
- The generic `other` asset is a reserved-part silhouette with a centered question mark, making its fallback purpose explicit.

## Validation

- Programmatically validate that the folder contains exactly the 26 expected category filenames.
- Validate that all SVGs have the required 32 × 32 dimensions, viewBox, and shared stroke attributes.
- Run the repository formatting, linting, and type-check gate after adding assets.

## Out of scope

- Importing or displaying icons in the client.
- Adding an icon registry or changing category data.
- Creating colored, filled, animated, or alternate-size variants.
