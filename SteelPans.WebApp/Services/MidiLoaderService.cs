using Melanchall.DryWetMidi.Core;
using Melanchall.DryWetMidi.Interaction;
using SteelPans.WebApp.Model;

namespace SteelPans.WebApp.Services;

public sealed class MidiLoaderService
{
    public async Task<List<MidiTrackInfo>> GetTrackInfosAsync(Stream midiStream)
    {
        await using var buffer = new MemoryStream();
        await midiStream.CopyToAsync(buffer);
        buffer.Position = 0;

        var file = MidiFile.Read(buffer);

        return file.GetTrackChunks()
            .Select((track, i) => new MidiTrackInfo
            {
                Index = i,
                Name = track.Events
                    .OfType<SequenceTrackNameEvent>()
                    .FirstOrDefault()?.Text,
                NoteCount = track.GetNotes().Count()
            })
            .ToList();
    }

    public async Task<List<MidiPanEvent>> LoadSingleTrackAsync(
        Stream midiStream,
        int trackIndex = 0,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(midiStream);

        if (!midiStream.CanRead)
            throw new ArgumentException("The MIDI stream must be readable.", nameof(midiStream));

        await using var buffer = new MemoryStream();
        await midiStream.CopyToAsync(buffer, cancellationToken);
        buffer.Position = 0;

        var midiFile = MidiFile.Read(buffer);
        var tempoMap = midiFile.GetTempoMap();

        var trackChunks = midiFile.GetTrackChunks().ToList();

        if (trackChunks.Count == 0)
            return [];

        if (trackIndex < 0 || trackIndex >= trackChunks.Count)
            throw new ArgumentOutOfRangeException(nameof(trackIndex));

        var notes = trackChunks[trackIndex]
            .GetNotes()
            .OrderBy(n => n.Time)
            .ToList();

        var events = new List<MidiPanEvent>(notes.Count);

        foreach (var midiNote in notes)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var startMetric = TimeConverter.ConvertTo<MetricTimeSpan>(midiNote.Time, tempoMap);
            var durationMetric = LengthConverter.ConvertTo<MetricTimeSpan>(
                midiNote.Length,
                midiNote.Time,
                tempoMap);

            events.Add(new MidiPanEvent
            {
                Note = Model.Note.FromMidi((int)midiNote.NoteNumber),
                Start = ToTimeSpan(startMetric),
                Duration = ToTimeSpan(durationMetric),
            });
        }

        return events;
    }

    private static TimeSpan ToTimeSpan(MetricTimeSpan m)
        => TimeSpan.FromHours(m.Hours)
         + TimeSpan.FromMinutes(m.Minutes)
         + TimeSpan.FromSeconds(m.Seconds)
         + TimeSpan.FromMilliseconds(m.Milliseconds);
}

public static class PanMidiMapper
{
    public static List<MidiPanEvent> FilterToPan(SteelPan pan, IEnumerable<MidiPanEvent> events)
    {
        return events
            .Where(e => pan.Notes.Any(n => n.Note.IsEnharmonicEquivalentTo(e.Note)))
            .ToList();
    }
}