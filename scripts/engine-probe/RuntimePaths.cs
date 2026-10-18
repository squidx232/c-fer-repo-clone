using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;

internal static class RuntimePaths
{
    internal static object Attempt(Func<object?> action)
    {
        try { return new {status = "success", result = action()}; }
        catch (Exception error) {
            var errors = new List<object>();
            for (Exception? e = error; e != null; e = e.InnerException)
                errors.Add(new {type = e.GetType().FullName, message = e.Message});
            return new {status = "blocked", errors};
        }
    }

    internal static void Run(string directory, string output)
    {
        Directory.CreateDirectory(output);
        Assembly Load(string name) => AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(directory, name));
        var report = new Dictionary<string, object?>();
        report["scope"] = "original loader attempts; no license patching, dependency stubs or bypasses";
        report["catalog"] = Attempt(() => {
            // Work on a copy so the distributed equipment database remains untouched.
            var copy = Path.Combine(output, "equipment-probe.db");
            File.Copy(Path.Combine(directory, "equipment.db"), copy, true);
            var data = Load("pcpump.data.dll");
            var type = data.GetType("q5", true)!;
            using var database = Activator.CreateInstance(type, new object[] {copy, true}) as IDisposable;
            return new {opened = database != null, type = type.FullName};
        });
        report["sampleProject"] = Attempt(() => {
            var binary = Load("pcpump.binary.dll");
            var reader = binary.GetType("la", true)!;
            var method = reader.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Single(m => m.Name == "a" && m.GetParameters().Length == 2 && m.GetParameters()[0].ParameterType == typeof(string));
            var warningsType = method.GetParameters()[1].ParameterType;
            var warningList = Activator.CreateInstance(warningsType);
            var instance = Activator.CreateInstance(reader);
            var project = method.Invoke(instance, new object?[] {Path.Combine(directory, "ss_1.pcp"), warningList});
            return new {loaded = project != null, projectType = project?.GetType().FullName,
                methods = project?.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).Select(m => m.ToString()).ToArray()};
        });
        report["desktopResources"] = Attempt(() => {
            var app = Load("pcpump.dll");
            var names = new List<object>();
            foreach (var resource in app.GetManifestResourceNames()) {
                if (!resource.EndsWith(".g.resources", StringComparison.OrdinalIgnoreCase)) continue;
                using var stream = app.GetManifestResourceStream(resource)!;
                using var reader = new System.Resources.ResourceReader(stream);
                var items = reader.GetEnumerator();
                while (items.MoveNext()) {
                    var name = (string)items.Key;
                    reader.GetResourceData(name, out var resourceType, out var bytes);
                    names.Add(new {name, resourceType, byteCount = bytes.Length});
                }
            }
            return new {resources = names, scope = "resource names and lengths only; no asset copies or visual parity claims"};
        });
        report["desktop"] = Attempt(() => {
            var app = Load("pcpump.dll");
            var references = app.GetReferencedAssemblies().Select(a => a.Name).ToArray();
            var resources = app.GetManifestResourceNames();
            // Loading a concrete WPF base type tests dependency availability, not UI parity.
            var wpf = Assembly.Load("PresentationFramework");
            return new {references, resources, wpf = wpf.FullName};
        });
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions {WriteIndented = true});
        File.WriteAllText(Path.Combine(output, "runtime-paths.json"), json);
        Console.WriteLine(json);
    }
}
