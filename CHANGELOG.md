# Changelog

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
