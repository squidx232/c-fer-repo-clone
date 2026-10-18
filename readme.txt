PCP Designer - browser-based progressing cavity pump (PCP) system design & analysis
=====================================================================================
A web clone of the C-FER PC-PUMP style workflow (Jira WA-9). Pure HTML/CSS/JavaScript,
no build step and no external dependencies; works offline.

Run
  npm start            -> serves the app at http://localhost:8080 (python3 http.server)
  or simply open index.html in a browser.
Test
  npm ci               -> install locked development-only test dependencies
  npm test             -> 47 calculation, original-output, equipment and DOM tests (node --test)
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

Continued extraction and fluid correlations
------------------------------------------
The remaining pc-pump-prefixed assemblies can be statically decompiled locally:
  python3 scripts/extract-managed-core.py
This writes per-assembly C# and logs plus a SHA-256/status inventory under the
ignored .local-analysis/managed-core/. A nonzero exit reports timeouts/failures;
a successful decompilation is NOT a validation of the recovered model. Third-party
DLLs are not included. No vendor executable or engine code is run by this tool.
Completed this pass: all 14 recovered pcpump*.dll assemblies returned exit code 0
with nonempty decompiler output. This includes the application, engine, domains,
data, binary/XML serializers, validation, charting, reporting and other support
assemblies. Sources and per-assembly hashes/logs remain local/git-ignored. Resource
assemblies may only produce metadata; nonempty output is not proof that every
obfuscated method was recovered correctly. Localized *.dll1/*.dll2 files and
third-party assemblies are outside this extraction pass.

js/fluid.js now implements independently written Beggs-Robinson correlations:
  Dead oil: y = 10^(3.0324 - 0.02023*API) / temperatureF^1.163
            viscosityCp = 10^y - 1
  Live oil: r = solutionGOR * 5.6146 (scf/STB)
            a = 10.715*(r+100)^(-0.515), b = 5.44*(r+150)^(-0.338)
            viscosityCp = a * deadOilViscosityCp^b
The public module uses Kelvin, Pa*s and standard m3/m3. Provenance and analytic
vectors are in tests/fixtures/fluid-evidence.json. Traced temperature/API limits
and live-oil Rs > 2070 scf/STB generate warnings. Invalid inputs are rejected.
Live-oil viscosity is a helper only, NOT wired to system analysis: Rs/PVT and gas
separation must be established first. In particular, its first input is dead-oil
viscosity, not temperature; preliminary identification was independently checked.

Production & Fluid now offers an OPT-IN Beggs-Robinson dead-oil + linear water
mixing model at one uniform user-specified temperature. Water viscosity is user
specified. Mixture viscosity = oil*(1-waterCut) + water*waterCut. The existing
engine's 0.1 cP floor remains. This viscosity feeds pump slip, tubing friction,
viscous rod torque, curves and reports. Model limitations are shown as warnings.
Specified mixture viscosity remains the default; old files keep prior results.
Temperature units are affine: Kelvin internally, Celsius/Fahrenheit in the UI.
There is NO depth temperature profile, emulsion inversion, non-Newtonian model,
free gas handling or full multiphase-flow implementation in this increment.

Obfuscated method mapping and measurable parity
----------------------------------------------
  python3 scripts/map-engine-obfuscation.py
Writes a local, ignored method inventory: source SHA-256, line ranges, method
signatures, Math calls, state-machine case counts and decompiler warnings. The
current engine has 199 top-level classes, 1683 matched method headers and 4039
warning comments. These are heuristic syntactic counts, NOT resolved-method or
parity percentages. Nested classes, compiler artifacts and overloads complicate
interpretation. No claim is made that decompiled methods are valid/recompilable.

The explicit coverage ledger is tests/fixtures/parity-coverage.json. Candidate
bench-test families tb/tc/s6 are identified, but input mappings and branches are
unresolved; tp/rx contain interpolation/log expressions with incomplete domain
mapping. Existing soft-string, trajectory and hydraulic tests are NOT evidence
of vendor parity. Third-party engines and licensed Windows UI were not executed.

A new reference-case checker makes numerical comparisons reproducible:
  node scripts/check-reference-cases.js --template > REFERENCE.json
  node scripts/check-reference-cases.js REFERENCE.json
Supply a complete SI project, independent expected outputs, absolute/relative
tolerances, application version and capture description. Templates deliberately
contain null expected values and fail until measured outputs are supplied. No
independent vendor case is bundled. The checker exits nonzero on discrepancies
and preserves calculated design errors/warnings. It only checks supplied numeric
outputs and cases, NOT warning, UI, file-format or full-system parity.

The Pump tab also offers a manual-guided friction estimate:
  frictionTorque = frictionFraction * displacementPerRev * ratedPressure / (2*pi)
This is a fraction of RATED hydraulic torque, constant with operating pressure;
it is not a fraction of operating torque. Switching from specified mode initializes
the fraction to preserve current friction torque. Switching back restores the
specified value. Reports include the selected model, fraction and resulting torque.
Manual guidance (standard fit/geometries, medium NBR):
  capacity < 0.4 m3/d/rpm: 20..50%; 0.4..0.8 inclusive: 15..25%; >0.8: 5..20%.
Guidance is advisory; nonnegative out-of-range fractions are accepted with a
warning. Temperature, swell and lubrication remain unmodeled. This is manual-
guided behavior, not a newly deobfuscated thermal/fit algorithm. Old projects
retain specified friction torque and unchanged results.

Run all Python tooling tests with:
  python3 -m unittest discover -s tests -p 'test_*.py'
There are 6 Python tests (5 extraction + 1 synthetic obfuscation-inventory test).
Full 100% replication has NOT been established: acceptance requires complete
scope inventory, branch/unit/sentinel mapping, independent licensed reference
runs across model combinations and edge cases, agreed output tolerances, and
browser end-to-end/visual checks. See the coverage ledger for remaining gaps.

Original engine execution and equipment scope (latest update)
-----------------------------------------------------------
The earlier statements that NO vendor engine was executed describe previous
increments and are now superseded for SIX numeric helper calls only. The original
PcPump.Engine assembly ran successfully under local .NET 8.0.32 on Linux:
  sy.e: dead-oil viscosity at (60 C,30 API), (80 C,20 API), (100 C,40 API)
  sy.i: live-oil viscosity with 100 cP dead oil and Rs 0,100,300 standard m3/m3
Outputs are committed as small numeric fixtures with provenance in
  tests/fixtures/original-engine-viscosity.json
The web implementations match after converting original cP outputs to Pa*s.
This is NOT full well-case, licensing, warning-branch, desktop or catalog parity.
The warning accumulator is null only for known in-range calls. The probe neither
patches assemblies nor stubs dependencies nor bypasses license checks. Loading
assemblies executes code: run only trusted authorized targets in the sandbox.
To reproduce (artifacts remain under ignored .local-analysis):
  bash scripts/analysis-tools.sh dotnet build scripts/engine-probe/EngineProbe.csproj \
    -o "$PWD/.local-analysis/engine-probe" \
    -p:BaseIntermediateOutputPath="$PWD/.local-analysis/engine-probe-obj/"
  bash scripts/analysis-tools.sh dotnet .local-analysis/engine-probe/EngineProbe.dll \
    "$PWD/.local-analysis/app-files"
The desktop app also requires WindowsDesktop.App; the isolated harness does not
launch that app. No claim is made that the complete simulation works on Linux.

Equipment options are NOT a fully extracted PC-PUMP catalog. Defaults remain
10 generic pumps, 5 generic drives, 5 starter grades and 6 starter rod sizes.
The recovered equipment.db is not plain readable SQLite. Data-layer tracing
shows SQLite-backed EquipmentModel loading, but its container/opening requirements
remain unresolved. No fabricated manufacturer records have been added.

The UI now supports:
  - Named custom pumps and drives saved to a project-local reusable library;
    entries appear in their model selectors and persist in JSON/localStorage.
  - Custom rod section size/name, body and coupling diameters, mass/length;
    custom material name, yield and tensile strengths, with SI validation.
  - Selecting custom properties seeds from the current preset. Selecting a
    standard size again removes custom geometry overrides. Continuous rod still
    uses calculated steel mass and body diameter for contact (existing model).
Custom properties feed rod loads, stress limits and reports. Tensile strength
is stored/validated but no new fatigue calculation is implied. Elastomer text is
metadata only. Named pump/drive libraries do not import vendor catalogs or bench
curves. Invalid rod dimensions/strengths fail analysis. No equipment entry is
certified merely by being saved to the user library.

Catalog, complete simulation and desktop runtime investigation
------------------------------------------------------------
New reproducible investigation mode (use the scoped build command above):
  bash scripts/analysis-tools.sh dotnet .local-analysis/engine-probe/EngineProbe.dll \
    "$PWD/.local-analysis/app-files" "$PWD/.local-analysis/runtime-paths"
The second argument enables original database/sample/UI dependency probes.
The catalog is copied before opening, so distributed equipment.db is untouched.
Results/logs stay ignored locally. The probe reports independent success/blocked
statuses; process success does NOT mean all targets opened. It executes original
code and must run only with authorized files in an isolated sandbox.

Verified original catalog chain:
  q5(string path, bool readOnly) -> q5.a -> q3.a -> EquipmentModel(SQLiteConnection).
The data layer uses EF6/System.Data.SQLite; it contains password-aware opening
branches. No passwords were extracted, no checks patched, no database protection
was bypassed. Installed real EventLog, Resources.Extensions and ConfigurationManager
NuGet dependencies resolved the initial missing-assembly errors. The ORIGINAL
catalog constructor now fails in Cfer.Logging.Logger initialization on missing
kernel32.dll under Linux. The original underlying database-open failure can be
masked by this logger error; no conclusion about database validity is justified.

Verified original sample path:
  la.a(string path, auc warnings) -> akm project.
Attempting the bundled ss_1.pcp fails on PresentationCore 8.0 (WPF). No sample
project was loaded. The desktop worker calls:
  r9.a(bool, akm, aua, q8, akk, af3, int = -1).
It needs a real loaded project, callback/adapter, equipment context, configuration
and unit preferences. The app orchestration also performs security checks. We
have NOT invoked a complete simulation, supplied fake contexts, or bypassed
security. A Windows-compatible runtime with WPF and the normal application
initialization is the concrete next requirement, not a guessed license failure.
Native SQLite/provider requirements may be discovered after initialization works.

Original desktop resources can be inventoried without running WPF:
  python3 scripts/inventory-desktop-catalog.py
The probe read 131 resource names/lengths, including 130 BAML resources (views,
charts, themes and dialogs, NOT necessarily 130 screens). No asset bytes are
committed. The local inventory also maps 30 catalog entity tables and properties,
including pump, rod, material, drive heads/housings, gearbox, hydraulic pump/motor,
cables, casing/tubing, rod guides, brakes, rod-whip and centrifugal-pump curves.
This establishes schema/scope, not equipment rows, units, manufacturer ratings or
UI state/behavior parity. Full database extraction and desktop parity remain open.

Remaining roadmap, in dependency order:
  1. Run these unchanged probes in a compatible Windows/WPF environment.
  2. Initialize the catalog using its normal original loading path and inspect rows.
  3. Load original sample projects, establish callback/config/unit contexts, then
     execute the normal authorized simulation flow and capture full outputs.
  4. Map each desktop input/state to those outputs; test numerical AND UI parity.
No full simulations or manufacturer rows are claimed in this investigation.
Python suite now includes 7 tests (extractor, method map and schema inventory).

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
