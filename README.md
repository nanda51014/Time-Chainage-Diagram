# Time–Chainage Diagram Tool

A self-contained, zero-dependency web tool for producing **time–chainage diagrams**
(a.k.a. time–distance / time–location / linear schedules) for linear infrastructure
construction projects — roads, rail, pipelines, tunnels, drainage, cabling.

Each activity is drawn as a line on a **chainage (horizontal)** vs. **time (vertical)**
grid. The slope of the line is the production rate: steeper = slower, flatter = faster.
Where lines converge, work-fronts are about to clash in space and time.

## Live demo

Once GitHub Pages is enabled (Settings → Pages → deploy from `main`, root folder),
the tool is available at:

```
https://nanda51014.github.io/Time-Chainage-Diagram/
```

## Run it

No build step, no server needed. Just open `index.html` in a browser:

```
# either double-click index.html, or serve locally:
python3 -m http.server 8000
# then visit http://localhost:8000
```

The tool loads with sample data so you can see a diagram immediately.

## Inputs

### Project settings
| Field | Meaning |
|-------|---------|
| Project start | Anchor date for the time axis |
| Time axis direction | Forward (top→bottom) or bottom→top |
| Chainage start / end | Spatial extent of the route (the X axis domain) |
| Units | metres or kilometres (axis labelled as `km+m`, e.g. `4+200`) |
| Working days | If ticked, rate-based durations skip weekends |

### Activities
| Column | Meaning |
|--------|---------|
| `name` | Activity label |
| `discipline` | Used to colour the line and build the legend |
| `fromCH` / `toCH` | Start and end chainage of the work-front (sets slope direction) |
| `start` | Start date (`YYYY-MM-DD`) |
| `mode` | `rate` or `date` |
| `value` | If `rate`: production rate in CH-units/day (finish is computed). If `date`: the finish date. |

## CSV import / export

Import a CSV with the header row:

```
name,discipline,fromCH,toCH,start,mode,value
```

See [`sample-activities.csv`](sample-activities.csv) for an example. If no recognised
header is present, columns are read positionally in the order above.

## Output

- **Interactive SVG** — hover any activity line for chainage extent, dates,
  duration and effective rate.
- **Download SVG** — vector, styles inlined so the file is self-contained.
- **Download PNG** — 2× raster for documents/presentations.
- **Export CSV** — round-trip your activity table.

## Clash detection

With **Flag clashes** ticked, the tool marks every point where two activities
occupy the same chainage at the same time (their lines cross) with a red dot.
Hover a marker to see which two activities clash and the chainage/date. The
count is shown as a badge next to the toggle. This needs no extra input — it's
derived purely from the activity geometry.

## Location markers

Add labelled vertical reference lines at key chainages — structures, level
crossings, stations, tie-in points. Each marker is a chainage + label, edited
in the **Location markers** table, and is drawn as a dashed line with a rotated
label so you can read activities against fixed features of the route.

## Dependencies & time buffers

Declare that one activity must trail another by a minimum number of days in the
**Dependencies** table (predecessor, successor, min days). Over the chainage
range the two share, the tool checks that the successor stays at least that many
days behind the predecessor and flags the worst point with an **amber diamond**
(hover for the shortfall, and whether the successor overtakes). Because both
work-fronts are linear in chainage, the tightest point is always an endpoint of
the shared range, so the check is exact. The violation count shows as a badge by
the section heading.

Distinct from clash detection: clashes are *geometric* (any two lines crossing);
buffer violations are *declared* sequence constraints you define.

## Roadmap / not yet implemented

- Minimum **space** (chainage) buffer, and dependencies involving vertical
  (zero-length) activities such as a single structure
- Access / possession windows and non-working calendar bands
- P6 / MS Project (XER/XML) import
