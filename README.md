# Time–Chainage Diagram Tool

A self-contained, zero-dependency web tool for producing **time–chainage diagrams**
(a.k.a. time–distance / time–location / linear schedules) for linear infrastructure
construction projects — roads, rail, pipelines, tunnels, drainage, cabling.

Each activity is drawn as a line on a **chainage (horizontal)** vs. **time (vertical)**
grid. The slope of the line is the production rate: steeper = slower, flatter = faster.
Where lines converge, work-fronts are about to clash in space and time.

## Background — what a time–chainage diagram is

A **time–chainage diagram** (also called **time–distance**, **time–location**, or
**linear schedule**) is the standard way to plan *linear* infrastructure — roads,
railways, pipelines, tunnels, transmission lines, drainage, cabling — where the
work stretches along a route.

It plots two axes:

- **Chainage** — position along the route (distance from a zero point, written
  like `4+200` for 4,200 m). The *spatial* axis.
- **Time** — dates / weeks / months. The *schedule* axis.

Each activity is drawn as a **line** from `(start date, start chainage)` to
`(finish date, end chainage)`. The insight is in the **slope**:

- **Slope = production rate** — shallow means fast (many metres/day), steep means slow.
- **Parallel lines** — work-fronts holding a constant gap: a healthy programme.
- **Converging / crossing lines** — two crews heading for the same place at the
  same time: a **clash**. This is what a Gantt chart hides.
- **Vertical line** — all time spent at one location (a bridge or shaft).

Where a Gantt chart tells you *when*, a time–chainage diagram tells you *when AND
where* — so you can spot spatial conflicts, buffer erosion, and access
constraints at a glance. That is why it is the preferred planning view on major
linear projects.

### Inputs it needs

1. **Route (space axis)** — chainage start/end, units, direction, and key
   location markers (structures, crossings, tie-ins).
2. **Time axis** — project start/end, resolution, and a working calendar
   (working days, holidays, seasonal windows).
3. **Activities** — name, discipline, from/to chainage, work direction, and
   timing supplied either *rate-driven* (start + production rate → computed
   finish) or *date-driven* (explicit start + finish).
4. **Logic & constraints** — dependencies with minimum time/space buffers,
   access/possession windows, and fixed milestones.
5. **Presentation** — colour per discipline, legend, gridlines, export.

This tool implements every one of those categories; the sections below map each
to a concrete input.

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

## Input sheet

There are two import formats, both via **Import CSV / sheet**. The tool
auto-detects which one you gave it (a project sheet contains `#` section
headers; anything else is treated as a flat activities CSV).

### 1. Project sheet (recommended) — the whole project in one file

A single CSV divided into sections, each starting with a line beginning `#`,
followed by that section's own header row and data rows. Blank lines are
ignored, and sections may appear in any order — only `#ACTIVITIES` is required.
This is Excel-friendly: paste each block into a sheet, or keep them stacked in
one column.

```
#PROJECT
key,value
start,2026-07-01
chStart,0
chEnd,10000
units,m                # m or km
timeDir,down           # down (forward) or up
skipWeekends,false     # true = rate durations skip weekends

#ACTIVITIES
name,discipline,fromCH,toCH,start,mode,value
Site clearance,Enabling,0,10000,2026-07-01,rate,400
Earthworks,Earthworks,0,10000,2026-07-20,rate,150
Bridge BR-04,Structures,4200,4600,2026-08-01,date,2027-03-01

#MARKERS
ch,label
7200,Level crossing

#DEPENDENCIES         # predecessor/successor reference activity names
predecessor,successor,minDays
Earthworks,Drainage,60

#WINDOWS              # blocked access/possession bands
fromCH,toCH,start,end,label
6000,8000,2026-12-01,2027-02-28,Env. closure
```

| Section | Columns | Notes |
|---------|---------|-------|
| `#PROJECT` | `key,value` | Optional. Keys: `start`, `chStart`, `chEnd`, `units`, `timeDir`, `skipWeekends`. |
| `#ACTIVITIES` | `name,discipline,fromCH,toCH,start,mode,value` | Required. `mode` is `rate` (value = CH-units/day) or `date` (value = finish date). |
| `#MARKERS` | `ch,label` | Optional vertical reference lines. |
| `#DEPENDENCIES` | `predecessor,successor,minDays` | Optional. Names must match `#ACTIVITIES`; unmatched rows are skipped. |
| `#WINDOWS` | `fromCH,toCH,start,end,label` | Optional blocked windows. |

Importing a project sheet **replaces the entire project** (settings and all
tables). Round-trip it with **Export project sheet**. A ready-to-edit starter is
in [`project-template.csv`](project-template.csv).

### 2. Flat activities CSV (legacy)

Just the activities, with the header row:

```
name,discipline,fromCH,toCH,start,mode,value
```

See [`sample-activities.csv`](sample-activities.csv). If no recognised header is
present, columns are read positionally in the order above. Importing this
**replaces activities only**, leaving project settings, markers, dependencies,
and windows untouched.

## Output

- **Interactive SVG** — hover any activity line for chainage extent, dates,
  duration and effective rate.
- **Download SVG** — vector, styles inlined so the file is self-contained.
- **Download PNG** — 2× raster for documents/presentations.
- **Export activities** — round-trip just the activity table (flat CSV).
- **Export project sheet** — round-trip the whole project (settings + all tables).

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

## Access / possession windows

Mark a chainage section closed to work between two dates in the **Access
windows** table (from/to CH, blocked-from/to dates, label) — seasonal or
environmental closures, rail possessions, third-party access constraints. Each
window draws as a shaded band on the diagram. Any activity whose work-front
passes through the band during its blocked period is flagged: the band turns
red, a square marker is placed on the offending activity, and a count badge
shows by the heading. Hover the band to list intruding activities, or a marker
to see which activity and window.

## Roadmap / not yet implemented

- Minimum **space** (chainage) buffer, and dependencies involving vertical
  (zero-length) activities such as a single structure
- Non-working calendar bands (weekends/holidays) drawn across the whole chart
- P6 / MS Project (XER/XML) import
