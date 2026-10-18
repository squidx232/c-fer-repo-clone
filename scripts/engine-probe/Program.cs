// Invokes narrow numeric methods in the ORIGINAL engine; no patching or stubbing.
// Input assemblies are executable code: run only in the isolated local sandbox.
using System.IO;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;

if (args.Length == 2 && args[0] == "--data-protection-check") {
    DataProtectionCheck.Run(Path.GetFullPath(args[1]));
    return;
}
if (args.Length == 3 && args[0] == "--catalog-only") {
    CatalogProbe.Run(Path.GetFullPath(args[1]), Path.GetFullPath(args[2]));
    return;
}
if (args.Length == 1 && args[0] == "--crypto-readiness") {
    CryptoReadiness.Run();
    return;
}
if (args.Length == 3 && args[0] == "--prepare-application") {
    PrepareApplication.Run(Path.GetFullPath(args[1]), Path.GetFullPath(args[2]));
    return;
}
if (args.Length < 1 || args.Length > 2) throw new ArgumentException("Expected extracted application directory and optional runtime-probe output directory");
var directory = Path.GetFullPath(args[0]);
AssemblyLoadContext.Default.Resolving += (_, name) => {
    var file = Directory.EnumerateFiles(directory, "*.dll")
        .FirstOrDefault(p => string.Equals(Path.GetFileNameWithoutExtension(p).Replace('_', '-'), name.Name, StringComparison.OrdinalIgnoreCase));
    return file == null ? null : AssemblyLoadContext.Default.LoadFromAssemblyPath(file);
};
if (args.Length == 2) {
    RuntimePaths.Run(directory, Path.GetFullPath(args[1]));
    return;
}
var report = new Dictionary<string, object?> {
    ["runtime"] = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
    ["platform"] = System.Runtime.InteropServices.RuntimeInformation.OSDescription,
    ["scope"] = "original assembly numeric-method probe; not desktop or full-system parity"
};
try {
    var engine = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(directory, "pcpump.engine.dll"));
    report["assembly"] = engine.FullName;
    report["references"] = engine.GetReferencedAssemblies().Select(a => a.FullName).ToArray();
    var type = engine.GetType("sy", throwOnError: true)!;
    var method = type.GetMethods(BindingFlags.Public | BindingFlags.Static)
        .Single(m => m.Name == "e" && m.GetParameters().Length == 3 &&
            m.GetParameters()[0].ParameterType == typeof(double) &&
            m.GetParameters()[1].ParameterType == typeof(double));
    report["method"] = method.ToString();
    var vectors = new List<object>();
    foreach (var (temperature, api) in new[] {(60.0, 30.0), (80.0, 20.0), (100.0, 40.0)}) {
        // In-range inputs avoid warning branches. No fake dependencies or license bypass.
        var value = method.Invoke(null, new object?[] {temperature, api, null});
        vectors.Add(new {temperatureC = temperature, api, originalValue = value});
    }
    report["vectors"] = vectors;
    var live = type.GetMethods(BindingFlags.NonPublic | BindingFlags.Static)
        .Single(m => m.Name == "i" && m.GetParameters().Length == 3 &&
            m.GetParameters()[0].ParameterType == typeof(double) && m.GetParameters()[1].ParameterType == typeof(double));
    var liveVectors = new List<object>();
    foreach (var gor in new[] {0.0, 100.0, 300.0}) {
        var value = live.Invoke(null, new object?[] {100.0, gor, null});
        liveVectors.Add(new {deadOilViscosityCp = 100.0, solutionGor = gor, originalValue = value});
    }
    report["liveOilVectors"] = liveVectors;
    report["status"] = "success";
} catch (Exception error) {
    report["status"] = "blocked";
    var errors = new List<object>();
    for (Exception? e = error; e != null; e = e.InnerException) {
        errors.Add(new {type = e.GetType().FullName, message = e.Message, stack = e.StackTrace});
    }
    report["errors"] = errors;
    Environment.ExitCode = 1;
}
Console.WriteLine(JsonSerializer.Serialize(report, new JsonSerializerOptions {WriteIndented = true}));
