using System.Buffers.Binary;

namespace Kinform.Api;

public static class JpegInput
{
    public const int MaxBytes = 2 * 1024 * 1024;
    public const int MaxDimension = 2048;

    public static byte[] Parse(string? base64)
    {
        if (string.IsNullOrWhiteSpace(base64) || base64.Length > (MaxBytes + 2) / 3 * 4)
            throw new MatchException("invalid_image", "Choose a JPEG portrait under 2 MB.");
        byte[] image;
        try { image = Convert.FromBase64String(base64); }
        catch (FormatException) { throw new MatchException("invalid_image", "The image encoding is invalid."); }
        if (image.Length > MaxBytes || !HasSafeDimensions(image))
            throw new MatchException("invalid_image", "Choose a valid JPEG between 64 and 2048 pixels on each side.");
        return image;
    }

    // A bounded container/dimension check, not a full decoder or face detector.
    // The client re-encodes JPEGs; a production upload service should also decode/re-encode.
    public static bool HasSafeDimensions(ReadOnlySpan<byte> data)
    {
        if (data.Length < 16 || data[0] != 0xff || data[1] != 0xd8 ||
            data[^2] != 0xff || data[^1] != 0xd9) return false;
        var offset = 2;
        while (offset + 4 <= data.Length)
        {
            if (data[offset++] != 0xff) return false;
            while (offset < data.Length && data[offset] == 0xff) offset++;
            if (offset >= data.Length) return false;
            var marker = data[offset++];
            if (marker is 0xda or 0xd9) return false;
            if (marker is 0x01 or >= 0xd0 and <= 0xd7) continue;
            if (offset + 2 > data.Length) return false;
            var length = BinaryPrimitives.ReadUInt16BigEndian(data.Slice(offset, 2));
            if (length < 2 || offset + length > data.Length) return false;
            if (marker is 0xc0 or 0xc1 or 0xc2)
            {
                if (length < 8) return false;
                var height = BinaryPrimitives.ReadUInt16BigEndian(data.Slice(offset + 3, 2));
                var width = BinaryPrimitives.ReadUInt16BigEndian(data.Slice(offset + 5, 2));
                return width is >= 64 and <= MaxDimension && height is >= 64 and <= MaxDimension;
            }
            offset += length;
        }
        return false;
    }
}
