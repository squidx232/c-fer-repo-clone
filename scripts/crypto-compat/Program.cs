using Mono.Cecil;
using Mono.Cecil.Cil;
using System.Security.Cryptography;
using System.Text.Json;

// Isolated Wine compatibility experiment on MIT-licensed ASP.NET only.
// Vendor licensing assemblies and catalog files are never modified.
if (args.Length != 2) throw new ArgumentException("Usage: CryptoCompat sourceDataProtection.dll separateOutput.dll");
var source = Path.GetFullPath(args[0]);
var output = Path.GetFullPath(args[1]);
if (source == output || File.Exists(output)) throw new IOException("Use a new, separate output file.");
using var assembly = AssemblyDefinition.ReadAssembly(source);
if (assembly.Name.Name != "Microsoft.AspNetCore.DataProtection" || assembly.Name.Version.Major != 8)
    throw new InvalidDataException("Expected ASP.NET Core DataProtection 8.x only.");
var selector = assembly.MainModule.Types.Single(t => t.FullName == "Microsoft.AspNetCore.DataProtection.SP800_108.SP800_108_CTR_HMACSHA512Util");
var method = selector.Methods.Single(m => m.Name == "CreateProvider" && m.Parameters.Count == 2 && m.Parameters[0].ParameterType is PointerType);
if ((assembly.MainModule.Attributes & ModuleAttributes.ILOnly) == 0)
    throw new InvalidDataException("Use the app-local IL assembly, not a ReadyToRun shared-framework image.");
if (!method.Body.Instructions.Any(i => i.OpCode == OpCodes.Call && i.Operand is MethodReference called && called.Name == "IsWindows8OrLater"))
    throw new InvalidDataException("Unexpected KDF selector; refusing an already changed or unknown assembly.");
var fallback = method.Body.Instructions.Single(i => i.OpCode == OpCodes.Newobj &&
    ((MethodReference)i.Operand).DeclaringType.Name == "Win7SP800_108_CTR_HMACSHA512Provider").Operand;
// Preserve the library's existing HMAC-SHA512 counter-mode implementation.
// Change only this KDF selector, not OS detection, encryption or authentication.
method.Body.Instructions.Clear();
method.Body.ExceptionHandlers.Clear();
method.Body.Variables.Clear();
var il = method.Body.GetILProcessor();
il.Emit(OpCodes.Ldarg_0);
il.Emit(OpCodes.Ldarg_1);
il.Emit(OpCodes.Newobj, (MethodReference)fallback);
il.Emit(OpCodes.Ret);
Directory.CreateDirectory(Path.GetDirectoryName(output)!);
assembly.Write(output);
Console.WriteLine(JsonSerializer.Serialize(new {
    scope = "local ASP.NET KDF provider compatibility experiment, not vendor/security modification",
    sourceSha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(source))).ToLowerInvariant(),
    outputSha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(output))).ToLowerInvariant(),
    changedMethod = method.FullName,
    implementation = "existing Win7 HMAC-SHA512 SP800-108 counter-mode provider",
    cryptographicEquivalenceValidated = false,
    note = "Validate independently before using. Local transformed strong-name signature is not valid; never distribute as an official assembly."
}, new JsonSerializerOptions { WriteIndented = true }));
