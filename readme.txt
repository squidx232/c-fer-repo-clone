PCP Designer - browser-based progressing cavity pump (PCP) system design & analysis
=====================================================================================
A web clone of the C-FER PC-PUMP style workflow (Jira WA-9). Pure HTML/CSS/JavaScript,
no build step and no external dependencies; works offline.

Catalog startup breakthrough (2026-10-18)
  The original application's cryptographic startup crash was overcome in an
  isolated local deployment. Its REAL Key Management window now opens.
  This is NOT successful activation, catalog access, or equipment extraction.
  Normal application startup waits at licensing/key setup in this sandbox.
  User authorization does not establish an installed/activated runtime license.

  Compatibility change is only in MIT-licensed ASP.NET DataProtection: select
  its existing Win7 HMAC-SHA512 SP800-108 provider instead of the unsupported
  Wine Win8 provider. Vendor security/licensing assemblies are unchanged.
  Provider outputs match an independent HMAC reference for 1,32,64,65,128 bytes.
  Synthetic Protect/Unprotect roundtrip succeeds; tampered ciphertext is rejected.
  The local transformed dependency is not an official signed assembly and must
  NOT be distributed as one. Original deployment and shared runtime untouched.

  Reproduce (all outputs and transformed dependencies stay .local-analysis):
    bash scripts/analysis-tools.sh dotnet build scripts/crypto-compat/CryptoCompat.csproj \
      -p:BaseIntermediateOutputPath="$PWD/.local-analysis/crypto-compat-obj/" \
      -o "$PWD/.local-analysis/crypto-compat"
    python3 scripts/prepare-catalog-compat.py \
      --source '.local-analysis/msi-layout/C-FER Technologies/PC-Pump' \
      --output .local-analysis/catalog-compat-new
  The script refuses an existing destination, verifies every unchanged file,
  and removes only Microsoft.AspNetCore.App from the COPY's framework list so
  shipped app-local ASP.NET dependencies are used. Core/WindowsDesktop remain.
  Otherwise the newer shared ASP.NET dependency overrides the local one and
  reproduces the old crash. The system/shared framework must not be patched.

  Build the Windows EngineProbe as before, then under Wine run:
    EngineProbe.dll --data-protection-check <isolated application directory>
  This tests the exact ASP.NET provider, roundtrip and authentication; it does
  NOT invoke vendor license checks or establish catalog readiness.
  Launch the isolated PcPump.dll with original dotnet-windows/dotnet.exe and an
  authorized DISPLAY. A timeout/running Key Management window is NOT success.

  No catalog passwords or licensing keys were extracted or fabricated; no vendor
  license result was patched. Manufacturer rows remain unread. This supersedes
  older claims that native Windows is the only possible next runtime step.

Catalog cryptography compatibility experiment (2026-10-18)
  Tested Wine's per-application Windows 7 compatibility setting, restoring it
  after the experiment. .NET SP800108HmacCounterKdf selected its built-in
  managed fallback and matched an independently computed public HMAC-SHA512
  vector. No vendor keys/data, licensing logic or cryptographic libraries were
  replaced. This success does NOT establish catalog readiness.

  Actual unchanged desktop startup still fails in the bundled ASP.NET
  DataProtection native provider. Its Cryptography.Cng.OSVersionUtil detects
  Windows 8+ by the presence of BCryptKeyDerivation in bcrypt.dll, not the OS
  version. Wine exports the function but cannot open SP800_108_CTR_HMAC.
  Therefore setting Windows compatibility version does NOT solve catalog access.
  CryptoReadiness now reports native algorithm support, export detection and
  the independent synthetic KDF result separately, with a failing exit status
  when native or .NET checks fail. The original desktop error remains recorded
  in its own log; no manufacturer rows were read in this experiment.

Catalog-only investigation (2026-10-18)
  Corrected a diagnostic assumption: q5 is the CUSTOM database API; the
  manufacturer catalog uses q6(string,string), which requests a read-only
  SQLite connection through q3. Earlier q5 failures were not a direct test
  of the manufacturer loader. The new --catalog-only mode tests q6 instead.

  The installer distributes TWO distinct catalogs:
    Database/equipment.db: 2,310,144 bytes (standard)
    Database_Educational/equipment.db: 245,760 bytes (educational)
  Neither has a plaintext SQLite header. Do not merge the two or treat the
  educational file as a decoded/full manufacturer catalog.

  Commands:
    python3 scripts/catalog-requirements.py \
      --application '.local-analysis/msi-layout/C-FER Technologies/PC-Pump'
    bash scripts/run-catalog-probe.sh
  Inventory: .local-analysis/catalog-requirements.json
  Execution report: .local-analysis/catalog-only/catalog-only.json
  The inventory maps 30 model tables and 46 q8 API operations. It contains
  schema/requirements, NOT equipment rows. All derived data stays ignored.
  The runtime probe works on copies and verifies original SHA-256 hashes.
  It queries counts only if the original q6 constructor actually succeeds;
  undocumented/obfuscated return types retain their original identifiers.

  Actual result: BOTH original q6 attempts fail q6 -> q3.a -> q1.a(bool),
  where application/security context ace.b() is uninitialized. No equipment
  collections were returned. The manufacturer loader is NOT independently
  runnable before normal security setup. The prior desktop run reaches that
  setup but Wine lacks the required SP800_108_CTR_HMAC cryptographic algorithm.
  This does not establish license validity/invalidity. No passwords, activation
  tokens or security singletons are fabricated/extracted/replaced.

  Catalog remains blocked: no manufacturer rows imported into the web app.
  This work is catalog-only; simulation/UI parity is unchanged.

Latest original-runtime investigation (2026-10-18)
  Fixed the staging ambiguity: scripts/stage-msi-application.py uses msiinfo
  exports of the actual File, Component and Directory tables, not assembly
  identity or cabinet filename guessing. All 309 files were restored with
  expected lengths and verified SHA-256 copies, including RID/native paths and
  Database/equipment.db. Registry entries and activation are NOT installed.

  Reproduce staging (requires local msitools/libmsi/libgsf):
    LD_LIBRARY_PATH="$PWD/.local-analysis/msitools/usr/lib/x86_64-linux-gnu" \
      python3 scripts/stage-msi-application.py \
      --msiinfo .local-analysis/msitools/usr/bin/msiinfo \
      --msi .local-analysis/installer-files/PC-PUMP.msi \
      --app-files .local-analysis/app-files --output .local-analysis/msi-layout
  Destination must be empty. Original vendor files remain local and ignored.

  WPF now runs on the local virtual display and enters the original security
  initialization (f.a -> ace.a -> ac7 -> adj -> ac3). The application's own
  log records CryptographicException in BCryptAlgorithmHandle.OpenAlgorithmHandle,
  reached through EphemeralDataProtectionProvider and SP800_108 key derivation.
  An isolated --crypto-readiness probe confirms Wine 11 opens AES and SHA512,
  but SP800_108_CTR_HMAC returns 0xC0000002 (STATUS_NOT_IMPLEMENTED).
  This is a runtime cryptography failure, NOT proof of an invalid license.
  No cryptographic provider, activation state, security singleton, or vendor
  code was replaced or bypassed. No guide codes or secret keys are published.

  scripts/local-xkb-path.c relocates only Xvfb's open-source XkbBinDirectory
  to the workspace keyboard compiler; it does not modify vendor software.
  scripts/run-local-desktop.sh runs on an existing authorized DISPLAY and
  enforces a timeout. It reports logs, not simulation success. Example:
    DISPLAY=:89 DESKTOP_TIMEOUT=60 bash scripts/run-local-desktop.sh
  Crypto diagnostic after building the Windows probe:
    EngineProbe.dll --crypto-readiness (run via Windows dotnet.exe under Wine)

  Still unresolved: manufacturer rows have not been read and no complete
  original simulation has run. Parsed sample analyses are input data only.
  Execution requires a Windows cryptographic runtime supporting this algorithm,
  followed by the application's normal authorized security initialization;
  further blockers may become visible after that. The web engine/UI are not
  100% vendor parity. This section supersedes older startup-blocker descriptions.

Run
  npm start            -> serves the app at http://localhost:8080 (python3 http.server)
  or simply open index.html in a browser.
Test
  npm ci               -> install locked development-only test dependencies
  npm test             -> 51 calculation, original-output, equipment and DOM tests (node --test)
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

Portable catalogs and runtime coverage screens (latest increment)
----------------------------------------------------------------
Equipment Catalog is a new web tab. Paste an authorized portable JSON export,
review the built-in/imported record counts and source provenance. Imports merge
atomically with project libraries and persist with the project. Duplicates,
reserved/built-in IDs, missing SI units, missing provenance, nonfinite ratings,
invalid grade strengths and impossible coupling geometry are rejected. No vendor
rows are bundled, no units are guessed, and equipment.db is NOT decoded here.
Supported schema (units are ALWAYS SI, regardless of UI display system):
  schemaVersion: 1
  units: "SI"
  provenance: {source: "supplier/export/version description"}
  pumps: [{id,name,displacement,ratedLift,rotorDiameter,maxSpeed,
           eccentricity,frictionTorque,slipAtRated}]
  drives: [{id,name,maxTorque,maxPower,maxSpeed,maxAxialLoad,efficiency}]
  rodGrades: [{id,name,yield,tensile}]
  rodSizes: [{id,name,diameter,couplingOd,massPerLength}]
Lists may be omitted; at least one supported entry is required. IDs must be
unique per type and cannot override built-ins or existing project records.
Displacement is m3/s at 100 rpm; ratedLift is m of fresh water; dimensions m;
torque N*m, power W, axial load N, strengths Pa, mass/length kg/m, efficiency a
0..1 fraction. maxSpeed is rpm. Imported pumps use the legacy rated-slip model;
optional bench curves/performance modes and other unrecognized fields are NOT
imported. Use the Pump editor to configure supported performance modes afterward.
The Show catalog format button provides an explicitly illustrative template,
not manufacturer data. Max pasted JSON size is 5 MiB, max 5000 entries per type.
Imported rod grades/sizes feed the same resolver as presets in the UI and engine.

Parity & Runtime is another new tab. It exposes verified coverage, unresolved
models and original runtime prerequisites without marking them implemented. It is
not a live connection to the original engine; the web analysis stays independent.

Windows readiness runner:
  scripts/run-windows-readiness.ps1 -ApplicationDirectory <authorized-installed-app>
By default results go under .local-analysis/windows-readiness. A custom output
directory must also be inside .local-analysis. Requires Windows, .NET 8 SDK and
Windows Desktop Runtime. It builds the probe with ProbeWindows=true, uses an
actual net8.0-windows/UseWPF runtime target, checks required files, applies an
execution timeout, and exits nonzero when any required loader probe is blocked.
It neither installs/activates PC-PUMP nor patches its code/license checks. It
copies equipment.db before probing, reports original errors, and tests sample
loading plus WPF availability. It does NOT execute a complete well simulation.
Both default net8.0 and net8.0-windows probe builds were verified with zero
warnings/errors in this Linux sandbox; Windows execution/PowerShell runtime
behavior remains untested here. Existing six numeric helper checks still pass.

Not delivered as complete: manufacturer database rows, complete original well
simulation, the unresolved calculation families, or full desktop/UI parity.
Those remain dependent on original Windows initialization and independent
reference outputs; the new screens make the status explicit rather than hiding
missing engineering capabilities behind generic options.

Wine 11 original-loader execution (latest evidence)
-------------------------------------------------
The prior Windows/WPF dependency blocker has now been partly overcome: workspace-
local Wine 11 runs official Windows .NET 8.0.32 + WindowsDesktop 8.0.32 bundles.
Microsoft runtime archives were SHA-512 checked against official release metadata;
WineHQ packages were SHA-256 checked against the WineHQ jammy Packages listing.
No global installation or vendor binary modification was made. Ubuntu Wine 6
was first tested but aborted at unimplemented GetProcessGroupAffinity; Wine 11
successfully loads PresentationFramework and enumerates desktop resources.

Reproducible invocation (requires the installed local bundles and Windows probe):
  bash scripts/run-wine-readiness.sh
The command clears stale reports, uses a separate Wine prefix, applies a timeout,
and exits nonzero for blocked original loaders. It is NOT a simulation bridge.
Current detailed report: .local-analysis/wine11-loader-results/runtime-paths.json
  desktop: success (WPF assembly availability only, not an interactive desktop)
  desktopResources: success
  catalog: blocked, q5 -> q3 -> q1.a throws NullReferenceException
  sampleProject: blocked, k7.a -> Enumerable.Max on empty warning collection
Adding the actual System.Threading.AccessControl 10.0.0 dependency resolved the
intermediate logging assembly failure. Stack retrieval now safely preserves the
original error even when dependency resolution prevents diagnostic formatting.

The catalog's q1.a accesses ace.b() application/security state; the harness has
not initialized that normal application context. This is NOT proof of a licence
denial, password failure or corrupted database. No secrets were extracted, no
security branch was patched, and no fake context/return value was injected.
The sample parse failure requires further original initialization/format tracing;
warning checks were NOT disabled and no successful project parse is claimed.
The dashboard now reflects these deeper failures instead of the superseded
missing-WPF errors. Complete database extraction, full original simulation,
remaining models and desktop behavioral/visual parity are STILL NOT complete.

Local bundle sources used (not committed):
  https://dl.winehq.org/wine-builds/ubuntu/dists/jammy/main/binary-amd64/Packages.gz
  https://dl.winehq.org/wine-builds/ubuntu/pool/main/w/wine/wine-stable-amd64_11.0.0.0~jammy-1_amd64.deb
  https://dl.winehq.org/wine-builds/ubuntu/pool/main/w/wine/wine-stable_11.0.0.0~jammy-1_amd64.deb
  https://builds.dotnet.microsoft.com/dotnet/release-metadata/8.0/releases.json
Extract WineHQ packages locally under .local-analysis/wine11/root and both win-x64
runtime zip bundles into .local-analysis/dotnet-windows. The loader's libunwind8
is extracted under .local-analysis/wine/root; all tool homes/prefixes stay local.
These are observed compatible components, not an automated general installer.

Parser initialization fix and successful original sample runs (latest)
--------------------------------------------------------------------
The earlier parser failure was caused by an incomplete harness, not proven bad
vendor files: auc is an analysis-PROFILE collection, not a generic warnings list.
The desktop's normal a5.a path seeds it from an at9 registry. The probe now uses
original constructors/helpers: new af3(), new at9(), uz.a(registry, units, false),
rs.a(profiles, registry), then la.a(path, profiles). No dummy profiles, altered
parser checks or patched return values are supplied. The false flag selects the
original registry's non-optional profile variants; it is not a security bypass.

With that fix, all 11 bundled ss*.pcp files load under Wine 11/Windows .NET 8.
They expose 29 analysis cases and 29 embedded EquipmentDefinitionModel objects;
each has 27 profiles. Counts/provenance are recorded in
  tests/fixtures/original-project-parsing.json
Detailed local output: .local-analysis/wine11-loader-results/sample-projects.json.
These are parsing successes, NOT 29 successful simulations or manufacturer
catalog extraction. Equipment-definition counts are not pump/drive model counts.
The probe fails sample readiness if any sample fails or none are found.

The next simulation dependency is now reflected from the actual original method:
  r9.a(bool, akm, aua, q8, akk, af3, int)
  aua has constructor (anu, aos); q8 is an IDisposable catalog-adapter interface.
The report's simulationRequirements section lists actual parameter assemblies,
constructors and interface flags. Its success status means signature inspection
succeeded; executed=false explicitly means no full simulation was run.
The normal application startup constructs security configuration and performs key
protection discovery before catalog use. The probe has not reproduced that full
startup; q1.a still encounters uninitialized ace.b() application/security state.
That null reference is not proof that activation was rejected. No activation,
security context or catalog adapter was faked. Full simulation, manufacturer rows,
web binary-project import and UI behavioral parity remain unresolved.

Normal desktop startup and deployment reconstruction (latest)
-------------------------------------------------------------
Further investigation confirms q6 is an EF/SQLite-backed q8 implementation, NOT
an in-memory sample catalog. Its internal EquipmentModel constructor does not
remove the need for a genuine initialized database. No fake q8 was supplied.

A new staging command restores shortened cabinet identifiers using each original
managed assembly's own identity, including culture directories for satellites:
  bash scripts/analysis-tools.sh dotnet .local-analysis/engine-probe/EngineProbe.dll \
    --prepare-application "$PWD/.local-analysis/app-files" \
    "$PWD/.local-analysis/staged-app-new"
Destination must be empty. Vendor code is unchanged and source files untouched.
Duplicate identities with differing bytes are quarantined in unresolved-variants,
not guessed or treated as interchangeable. staging-map.json records source/name
mapping; staging-readiness.json audits runtime assets against pcpump.deps.json.
The captured pass staged 309 files, quarantined 15 ambiguous identities and found
18 unresolved runtime assets. RID-specific runtimeTargets are NOT yet resolved;
this is deployment reconstruction tooling, not a completed installation.

The official ASP.NET Core 8.0.32 win-x64 runtime was also installed locally and
SHA-512 verified against Microsoft's release metadata (the application requires
Core, WindowsDesktop AND ASP.NET Core). Launching the original staged PcPump.dll
entrypoint under Wine 11 now reaches original f.a -> f.b -> WPF XAML loading.
It fails when WPF creates a resource-listener window: no display driver/server
is available. A workspace-local Xvfb attempt failed because its packaged keyboard
compiler expects /usr/bin/xkbcomp. No system directory was modified to work around
that sandbox restriction. No real desktop window or successful security/catalog
startup was observed. The virtual-display failure does not prove an application
or license defect, and remaining manifest gaps may appear after it is resolved.

Latest status: original sample parsing works for all bundled projects; catalog
initialization and complete simulation still do not. The underlying normal startup
must run with valid installation assets, working display/native dependencies and
legitimate application/license configuration. No security keys, checks or catalog
adapter results were forged or bypassed. Both probe targets still compile cleanly;
all 51 JavaScript and 7 Python tests pass. Vendor binaries/resources remain local.

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
