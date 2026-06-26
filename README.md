# Time–Chainage Diagram Tool

A self-contained, zero-dependency web tool for producing **time–chainage diagrams**
(a.k.a. time–distance / time–location / linear schedules) for linear infrastructure
construction projects — roads, rail, pipelines, tunnels, drainage, cabling.

Each activity is drawn as a line on a **chainage (horizontal)** vs. **time (vertical)**
grid. The slope of the line is the production rate: steeper = slower, flatter = faster.
Where lines converge, work-fronts are about to clash in space and time.

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

## Roadmap / not yet implemented

- Dependencies & buffers between activities (clash validation)
- Access / possession windows and non-working calendar bands
- Location markers (structures, crossings) as labelled gridlines
- P6 / MS Project (XER/XML) import
