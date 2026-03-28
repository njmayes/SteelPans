namespace SteelPans.WebApp.Model;

public sealed class MidiTrackInfo
{
    public required int Index { get; init; }
    public string? Name { get; init; }
    public int NoteCount { get; init; }
}
public sealed class MidiPanPlaybackAction
{
    public required Note Note { get; init; }
    public required TimeSpan Time { get; init; }
    public required bool IsNoteOn { get; init; }
}

public sealed class MidiPanScheduledAction
{
    public required string NoteKey { get; init; }
    public required double TimeSeconds { get; init; }
    public required bool IsNoteOn { get; init; }
}

public sealed class MidiPanEvent
{
    public required Note Note { get; init; }
    public required TimeSpan Start { get; init; }
    public required TimeSpan Duration { get; init; }

    public TimeSpan End => Start + Duration;
}