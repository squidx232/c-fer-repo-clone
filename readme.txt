PCP Designer - browser-based progressing cavity pump (PCP) system design & analysis
=====================================================================================
A web clone of the C-FER PC-PUMP style workflow (Jira WA-9). Pure HTML/CSS/JavaScript,
no build step and no external dependencies; works offline.

Run
  npm start            -> serves the app at http://localhost:8080 (python3 http.server)
  or simply open index.html in a browser.
Test
  npm ci               -> install locked development-only test dependencies
  npm test             -> 25 calculation and DOM integration tests (node --test)
  python3 -m unittest discover -s tests -p 'test_extract_is_stream.py'
                       -> 5 installer-extraction safety tests

Workflow (left-hand tabs)
  Project          case details, node spacing, rod-load & side-load design limits
  Wellbore         deviation survey (editable table, presets, paste import), tubing,
                   casing, pump depth; vertical-section, plan and dogleg plots
  Production/Fluid wellhead pressures, fluid level or pump intake pressure,
                   oil API, water cut, water SG, viscosity, target rate
  Pump             generic pump catalog or custom geometry, speed, solve speed for target rate
  Rod String       tapered string of sucker-rod sections (grade/size), coupling spacing
                   (0 = continuous rod), rod/tubing friction coefficient
  Surface Drive    drive catalog / ratings and utilisation bars
  Load Analysis    rod load %, torque, axial load, side load, pressure and stress vs depth
  Pump Curves      rate / torque / volumetric efficiency vs differential pressure
  Speed Sweep      rate, torque, power, rod load and efficiency vs speed
  Results Table    node-by-node results (CSV export from the toolbar)
Toolbar: New, Open/Save project (.json), Export CSV, printable Report, Metric/Imperial
units, dark mode. The current project is auto-saved in browser localStorage.

Verified performance integration (equation-level scope, not full PC-PUMP parity)
--------------------------------------------------------------------------
The Pump tab now supports four volumetric models:
  legacy:    original rated-slip calculation; absent new fields retain exponent 0.5
  linear:    etaRef = eta0 + (etaRated - eta0) * (deltaP / ratedPressure)
  quadratic: etaRef = eta0 + (etaRated - eta0) * (deltaP / ratedPressure)^2
  constant:  actualRate = theoreticalRate * efficiencyAtRated
For the linear/quadratic models:
  referenceSlip = displacementPerRev * referenceSpeed / 60 * (1 - etaRef)
  targetSlip = referenceSlip * (referenceViscosity / fluidViscosity)^exponent
  actualRate = max(0, theoreticalRate - targetSlip)
Viscosity correction defaults to 0.33 when selecting a new variable-efficiency
model. Exponent 0 disables viscosity correction. Existing projects retain their
original calculation; selecting a model does not rewrite explicit settings.
New settings use SI internally and persist in JSON/localStorage. They feed the
operating point, speed solve/sweep, pump curves, and printable report. Efficiency
inputs must be 0..100%, nonincreasing with pressure. Constant mode ignores the
curve reference speed and viscosity correction. Out-of-rating calculations remain
screening extrapolations and retain the existing rated-pressure warnings.

Evidence is recorded in tests/fixtures/performance-evidence.json. The installed
manual's variable efficiency and viscosity topics were cross-checked against
PcPump.Engine 5.2.1.18703: class tu maps efficiency polynomial coefficients to
slip and applies viscosity power corrections; domain au8 initializes 0.33. Only
original equations, inputs, test vectors and provenance are committed, not vendor
source or assets. The test vectors are independent analytical values, NOT outputs
from executing the vendor engine. DOM tests stub chart rendering; they verify
wiring, units, storage, report generation, and navigation, not visual accuracy.

Still not complete: multiphase/PVT and gas separation, thermal/elastomer models,
bench-test interpolation, full rod mechanics/fatigue/wear, vendor catalog/project
import, and full-system warning/output parity. The equipment.db file is NOT a
readable SQLite database; its format has not been established. No vendor
engine execution or reference-output benchmark has been performed, so equivalent
engineering accuracy must not be claimed. Next milestones are per-model tracing,
unit/boundary verification, and reference well cases with agreed tolerances.

Engineering models (js/engine.js, SI internally)
  - Trajectory: minimum curvature method.
  - Fluid: dead oil + water mixture density; Newtonian viscosity; no free gas.
  - Tubing/rod annulus friction: concentric annulus, exact laminar solution or
    Blasius turbulent; coupled with the pump flow by bisection.
  - Pump: Q = q*N - slip; legacy or linear/quadratic reference curves with a
    configurable viscosity exponent, or constant efficiency (details above).
    Torque = q*dP/(2*pi) + elastomer friction torque. Rotor thrust = dP * stator cavity area.
  - Rod string: soft-string model integrated pump -> surface: buoyed weight, rod/tubing
    contact (side) loads, contact-friction torque, viscous (Couette) torque, von Mises
    stress from axial + bending + torsion, rod stretch and torsional wind-up.
  - Checks: pump lift rating, volumetric efficiency, rod load, side load, coupling fit,
    drive torque / power / speed / thrust-bearing ratings, pumped-off condition.

Limitations: screening-level results; pump catalog values are generic/illustrative and
not manufacturer data. Results must be verified by a qualified engineer.

Layout
  index.html, css/styles.css
  js/units.js    unit conversion (metric / imperial)
  js/catalog.js  pumps, rods, tubing, casing, drives, survey presets, default project
  js/engine.js   calculation engine (UMD: browser global + Node module)
  js/charts.js   dependency-free canvas charts with hover read-out
  js/app.js      UI controller
  tests/         node:test unit tests

Local static-analysis tools (development only)
----------------------------------------------
Installed in this sandbox under .local-analysis/ (git-ignored):
  REA 6.7.0, Ghidra 12.1.4, 7-Zip 26.04, Unshield 1.4.2-1.
  Existing runtimes: Node 24.11.0 and full 64-bit JDK 21.0.8.
The binaries are NOT committed, shipped with the app, or installed globally.
Use the launcher from the repository root:
  bash scripts/analysis-tools.sh doctor --provider ghidra --json
  bash scripts/analysis-tools.sh analyze /absolute/path/to/program --provider ghidra --json
  bash scripts/analysis-tools.sh decompile /absolute/path/to/program FUNCTION --provider ghidra --json
  bash scripts/analysis-tools.sh 7z l /absolute/path/to/archive
  bash scripts/analysis-tools.sh unshield l /absolute/path/to/data1.cab
The launcher scopes tool home/cache/temp directories to this workspace. No MCP
agent registration or global configuration is modified. Use static analysis only;
do not execute unknown targets as part of extraction.

To recreate the local installation in a fresh workspace:
  1. Create .local-analysis/{downloads,7zip,unshield,home,tmp}.
  2. npm install --prefix .local-analysis/rea --no-audit --no-fund --ignore-scripts rea-agents@6.7.0
  3. Download and unzip the official Ghidra 12.1.4 release into .local-analysis/:
     https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
  4. Extract the official 7-Zip Linux x64 tarball into .local-analysis/7zip/:
     https://github.com/ip7z/7zip/releases/download/26.04/7z2604-linux-x64.tar.xz
  5. Download the Ubuntu jammy unshield and libunshield0 packages from:
     https://archive.ubuntu.com/ubuntu/pool/universe/u/unshield/
     Use unshield_1.4.2-1_amd64.deb and libunshield0_1.4.2-1_amd64.deb.
     Extract each with dpkg-deb -x PACKAGE .local-analysis/unshield (no root needed).
  6. Ensure Node and a full 64-bit JDK 21+ are on PATH, then run the doctor command.
These instructions target Linux x86_64. Follow upstream licenses for each tool.

Verification: scoped REA/Ghidra doctor checks passed. A known-source native test
program was analyzed and its hydraulic-torque function successfully decompiled.
The web app's 13 unit tests still pass. Missing optional providers (Hopper, IDA,
JADX) are informational and are not needed for this native Ghidra workflow.

Installer extraction is now working without running Windows code:
  1. Use 7-Zip to extract the installer's [0] overlay.
  2. python3 scripts/extract-is-stream.py OVERLAY OUTPUT_DIRECTORY
  3. Use 7-Zip to extract Data1.cab from PC-PUMP.msi, then extract that cabinet.
The Python stream extractor adapts the MIT-licensed lifenjoiner/ISx format and
byte transform, with attribution/license retained in the source. It requires
only Python's standard library, validates entry bounds and paths, refuses
existing output files, and caps total decompressed output (default 2 GiB).
Supported: ISSetupStream versions 0..4 with plain or flag-4 block encoding;
flag-2-only full-file transforms are explicitly unsupported. Synthetic tests:
  python3 -m unittest discover -s tests -p 'test_extract_is_stream.py'

Actual extraction recovered 12 installer components and 309 application files.
The engine target is app-files/pcpump.engine.dll (assembly PcPump.Engine,
version 5.2.1.18703), a managed AnyCPU CIL assembly. REA successfully inspected
its metadata and members. Many type/method names are obfuscated.
The DLL SHA-256 is:
  c9b6f7a73c86fdeff1c8cfc3a12098a74c1e4bed0d882f5408b7610ce84fc9df

Additional workspace-local tools installed for managed analysis:
  .NET SDK 8.0.426 and ILSpy CLI 9.1.0.7988.
Recreate using the official dotnet-install.sh from https://dot.net/v1/dotnet-install.sh
with --channel 8.0 --install-dir .local-analysis/dotnet --no-path, then:
  DOTNET_ROOT="$PWD/.local-analysis/dotnet" DOTNET_CLI_HOME="$PWD/.local-analysis/home" \
    .local-analysis/dotnet/dotnet tool install ilspycmd --version 9.1.0.7988 \
    --tool-path "$PWD/.local-analysis/ilspy"
Use the launcher:
  bash scripts/analysis-tools.sh dotnet --info
  bash scripts/analysis-tools.sh ilspy -l c .local-analysis/app-files/pcpump.engine.dll
  bash scripts/analysis-tools.sh ilspy -t TYPE_NAME .local-analysis/app-files/pcpump.engine.dll
ILSpy successfully decompiled CustomExpressionFunctionContext from the real
engine; this verifies tooling, not correctness or identification of equations.

No Windows installer or vendor engine was executed. No licence checks were
modified or bypassed. No calculation changes were made. Recovered proprietary
files and decompiler output remain local/git-ignored; only tooling is committed.
The remaining engineering work is to map calculation methods despite obfuscated
names, document equations and units, then validate against reference cases before
changing the web engine. Downloads and diagnostics remain in .local-analysis/.

Downloaded archive SHA-256 values (recorded, not independent vendor signatures):
  Ghidra: ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db
  7-Zip: fc0327ba27e89bd086cf426dff17d77de582953cdbbc10a6576540a06853ffcd
  Unshield: ad0d036b85669615014af424f244e9af40e33d89a763da9ea569d3e0b4a8b2b1
  libunshield0: dd6e905044f012de5aafc77cc34b1cf2d99fa03d772c86db3947110bb67fa843
