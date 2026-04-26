namespace SteelPans.WebApp.Model;

public sealed class MidiTrackAssignment
{
    public required int Index { get; init; }
    public required string Label { get; init; }
    public int NoteCount { get; init; }
    public bool IsSelected { get; set; }
    public PanType AssignedPanType { get; set; }
}
