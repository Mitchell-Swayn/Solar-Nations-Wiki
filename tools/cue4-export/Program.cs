using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Versions;
using CUE4Parse.MappingsProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse_Conversion.Textures;
using Newtonsoft.Json;
using SkiaSharp;

// Usage:
//   dotnet run <gameContentPaksDir> <usmapPath> <outDir>                 (define tables -> JSON)
//   dotnet run <gameContentPaksDir> <usmapPath> <outDir> <textureList>   (Texture2D -> PNG)
var paksDir = args[0];
var usmapPath = args[1];
var outDir = args[2];
var textureList = args.Length > 3 ? args[3] : null;

var provider = new DefaultFileProvider(paksDir, SearchOption.TopDirectoryOnly,
    new VersionContainer(EGame.GAME_UE5_7));
provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmapPath);
provider.Initialize();
provider.Mount();

Directory.CreateDirectory(outDir);

if (textureList != null)
{
    int tok = 0, tfail = 0;
    foreach (var line in File.ReadAllLines(textureList))
    {
        var assetPath = line.Trim();
        if (assetPath.Length == 0 || assetPath.StartsWith('#')) continue;
        try
        {
            var texture = provider.LoadPackage(assetPath).GetExports().OfType<UTexture2D>().First();
            var bitmap = texture.Decode() ?? throw new Exception("decode returned null");
            var pngPath = Path.Combine(outDir, Path.GetFileNameWithoutExtension(assetPath) + ".png");
            var data = bitmap.Encode(CUE4Parse_Conversion.Textures.ETextureFormat.Png, false, out _);
            File.WriteAllBytes(pngPath, data);
            tok++;
        }
        catch (Exception e)
        {
            tfail++;
            Console.Error.WriteLine($"FAIL {assetPath}: {e.Message}");
        }
    }
    Console.WriteLine($"Decoded {tok} textures, {tfail} failures, to {outDir}");
    return;
}

const string prefix = "twilightModernity/Content/Blueprints/Struct/Defines/";

int ok = 0, fail = 0;
foreach (var (path, _) in provider.Files)
{
    if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) continue;
    if (!path.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase)) continue;
    var rel = path.Substring(prefix.Length);
    var outPath = Path.Combine(outDir, Path.ChangeExtension(rel, ".json"));
    Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
    try
    {
        var pkg = provider.LoadPackage(path);
        var exports = pkg.GetExports().ToArray();
        File.WriteAllText(outPath, JsonConvert.SerializeObject(exports, Formatting.Indented));
        ok++;
    }
    catch (Exception e)
    {
        fail++;
        Console.Error.WriteLine($"FAIL {rel}: {e.Message}");
    }
}
Console.WriteLine($"Exported {ok} assets, {fail} failures, to {outDir}");
