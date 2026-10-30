# Changelog

## 1.0.4

### Fixed

- Smaller bundles with the same behavior.

## 1.0.3

### Fixed

- Smaller bundles with the same behavior. Production builds of table, query and virtual throw short codes (`TABLE_DUPLICATE`, `QUERY_LIMIT`, `VIRTUAL_KERNEL`) instead of the development messages; each package's README lists them.
- virtual: measuring a row that starts above the scroll offset moves the offset by the size change, so dynamic-height lists no longer jump when scrolling up; `adjustScrollOnMeasure: false` turns it off
- virtual: a smooth `scrollToIndex` keeps its re-alignment while the scroll is on its way and re-aligns once on arrival

## 1.0.2

### Fixed

- `scrollToIndex(Infinity)` scrolls to the last row (and `-Infinity` to the first) instead of the top.
- A right-to-left horizontal list on the window with a `scrollMargin` scrolls to the negative of the offset plus the margin, matching how the position is read back.
- A size estimate that is `0`, negative, `NaN` or infinite lays a row out as 1px (a measured size is unchanged), so `estimateSize: 0` no longer renders only the last rows of a long list.

## 1.0.1

### Changed

- Released at 1.0.1 with the other packages, which share one version. No change to this package.

## 1.0.0

### Fixed

- Run infinite-loader callbacks untracked during explicit retries as well as automatic loading.

### Added

- Windowed lists and grids with measurement and horizontal reading-direction support.
- Optional scroll-to and sticky-item features.
