window.steelPan = {
    _refs: {},
    _audioBuffers: {},
    _audioContext: null,
    _gainByComponent: {},
    _volumeByComponent: {},
    _scheduledSourcesByComponent: {},
    _scheduledSourcesByNoteByComponent: {},
    _scheduledVisualTimersByComponent: {},
    _panElements: {},
    _metronomeNodes: [],

    register: function (id, dotNetRef) {
        this._refs[id] = dotNetRef;
    },

    unregister: function (id) {
        delete this._refs[id];
        delete this._panElements[id];
        delete this._volumeByComponent[id];

        const gain = this._gainByComponent[id];
        if (gain) {
            try {
                gain.disconnect();
            } catch { }
            delete this._gainByComponent[id];
        }

        this.stopMidiSchedule(id);
        this.clearPlayingVisuals(id);
    },

    _ensureAudioContext: async function () {
        if (!this._audioContext) {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            this._audioContext = new AudioContextCtor();
        }

        if (this._audioContext.state === "suspended")
            await this._audioContext.resume();

        return this._audioContext;
    },

    _getOrCreateComponentGain: async function (componentId) {
        const audioContext = await this._ensureAudioContext();

        let gain = this._gainByComponent[componentId];
        if (!gain) {
            gain = audioContext.createGain();
            gain.gain.value = this._volumeByComponent[componentId] ?? 1.0;
            gain.connect(audioContext.destination);
            this._gainByComponent[componentId] = gain;
        }

        return gain;
    },

    setComponentVolume: async function (componentId, volume) {
        if (!componentId)
            return;

        const numericVolume = Number(volume);
        const clampedVolume = Number.isFinite(numericVolume)
            ? Math.max(0, Math.min(1, numericVolume))
            : 1.0;

        this._volumeByComponent[componentId] = clampedVolume;

        const gain = await this._getOrCreateComponentGain(componentId);
        const now = this._audioContext.currentTime;

        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(clampedVolume, now + 0.03);
    },

    bindPanElements: function (componentId) {
        if (!componentId)
            return;

        const noteElements = {};
        const labelElements = {};

        const allNoteEls = document.querySelectorAll(`[data-pan-note][data-pan-component="${componentId}"]`);
        const allLabelEls = document.querySelectorAll(`[data-pan-label][data-pan-component="${componentId}"]`);

        for (const el of allNoteEls) {
            const key = el.getAttribute("data-pan-note");
            if (key)
                noteElements[key] = el;
        }

        for (const el of allLabelEls) {
            const key = el.getAttribute("data-pan-label");
            if (key)
                labelElements[key] = el;
        }

        this._panElements[componentId] = {
            noteElements: noteElements,
            labelElements: labelElements
        };
    },

    getAudioTime: async function () {
        const ctx = await this._ensureAudioContext();
        return ctx.currentTime;
    },

    _getSamplePath: function (noteKey) {
        const normalized = this._normalizeEnharmonic(noteKey);
        return `/audio/samples/${encodeURIComponent(normalized)}.wav`;
    },

    _loadBuffer: async function (noteKey) {
        const ctx = await this._ensureAudioContext();
        const path = this._getSamplePath(noteKey);

        let buffer = this._audioBuffers[path];
        if (buffer)
            return buffer;

        const response = await fetch(path);
        const arrayBuffer = await response.arrayBuffer();
        buffer = await ctx.decodeAudioData(arrayBuffer);

        this._audioBuffers[path] = buffer;
        return buffer;
    },

    preloadNotes: async function (noteKeys) {
        if (!Array.isArray(noteKeys) || noteKeys.length === 0)
            return;

        await Promise.all(noteKeys.map(noteKey => this._loadBuffer(noteKey)));
    },

    playNote: async function (componentId, noteKey) {
        const ctx = await this._ensureAudioContext();
        const buffer = await this._loadBuffer(noteKey);

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const componentGain = await this._getOrCreateComponentGain(componentId);
        source.connect(componentGain);

        source.start();

        return true;
    },

    playNotes: async function (componentId, noteKeys) {
        if (!Array.isArray(noteKeys) || noteKeys.length === 0)
            return;

        const ctx = await this._ensureAudioContext();
        const componentGain = await this._getOrCreateComponentGain(componentId);

        for (const noteKey of noteKeys) {
            const buffer = await this._loadBuffer(noteKey);

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(componentGain);
            source.start();
        }
    },

    _getBoundPan: function (componentId) {
        return this._panElements[componentId] || null;
    },

    _parseNoteKey: function (noteKey) {
        const match = /^([A-G])([#b]?)(-?\d+)$/.exec(noteKey);
        if (!match)
            return null;

        return {
            letter: match[1],
            accidental: match[2] || "",
            octave: parseInt(match[3], 10)
        };
    },

    _toSemitone: function (noteKey) {
        const parsed = this._parseNoteKey(noteKey);
        if (!parsed)
            return null;

        const baseSemitones = {
            C: 0,
            D: 2,
            E: 4,
            F: 5,
            G: 7,
            A: 9,
            B: 11
        };

        let semitone = baseSemitones[parsed.letter];
        if (parsed.accidental === "#")
            semitone += 1;
        else if (parsed.accidental === "b")
            semitone -= 1;

        let octave = parsed.octave;

        while (semitone < 0) {
            semitone += 12;
            octave -= 1;
        }

        while (semitone >= 12) {
            semitone -= 12;
            octave += 1;
        }

        return {
            semitone: semitone,
            octave: octave
        };
    },

    _fromSemitoneSharp: function (semitone, octave) {
        const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        return `${names[semitone]}${octave}`;
    },

    _fromSemitoneFlat: function (semitone, octave) {
        const names = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
        return `${names[semitone]}${octave}`;
    },

    _normalizeEnharmonic: function (noteKey) {
        const semitoneInfo = this._toSemitone(noteKey);
        if (!semitoneInfo)
            return noteKey;

        return this._fromSemitoneSharp(semitoneInfo.semitone, semitoneInfo.octave);
    },

    _getEquivalentNoteKeys: function (noteKey) {
        const semitoneInfo = this._toSemitone(noteKey);
        if (!semitoneInfo)
            return [noteKey];

        const result = [];
        const seen = new Set();

        const add = (key) => {
            if (!seen.has(key)) {
                seen.add(key);
                result.push(key);
            }
        };

        add(noteKey);
        add(this._fromSemitoneSharp(semitoneInfo.semitone, semitoneInfo.octave));
        add(this._fromSemitoneFlat(semitoneInfo.semitone, semitoneInfo.octave));

        return result;
    },

    _getPanTargetsForNoteKey: function (pan, noteKey) {
        const noteElements = [];
        const labelElements = [];
        const noteSeen = new Set();
        const labelSeen = new Set();

        for (const key of this._getEquivalentNoteKeys(noteKey)) {
            const noteEl = pan.noteElements[key];
            if (noteEl && !noteSeen.has(noteEl)) {
                noteSeen.add(noteEl);
                noteElements.push(noteEl);
            }

            const labelEl = pan.labelElements[key];
            if (labelEl && !labelSeen.has(labelEl)) {
                labelSeen.add(labelEl);
                labelElements.push(labelEl);
            }
        }

        return {
            noteElements: noteElements,
            labelElements: labelElements
        };
    },

    _setNotePlaying: function (componentId, noteKey, isPlaying) {
        const pan = this._getBoundPan(componentId);
        if (!pan)
            return;

        const targets = this._getPanTargetsForNoteKey(pan, noteKey);

        for (const noteEl of targets.noteElements) {
            noteEl.classList.toggle("sp-note--on", !!isPlaying);
        }

        for (const labelEl of targets.labelElements) {
            labelEl.classList.toggle("sp-label--on", !!isPlaying);
        }
    },

    _ensureComponentScheduleState: function (componentId) {
        if (!this._scheduledSourcesByComponent[componentId])
            this._scheduledSourcesByComponent[componentId] = [];

        if (!this._scheduledSourcesByNoteByComponent[componentId])
            this._scheduledSourcesByNoteByComponent[componentId] = {};

        if (!this._scheduledVisualTimersByComponent[componentId])
            this._scheduledVisualTimersByComponent[componentId] = [];
    },

    clearPlayingVisuals: function (componentId, noteKeys) {
        const pan = this._getBoundPan(componentId);
        if (!pan)
            return;

        if (Array.isArray(noteKeys) && noteKeys.length > 0) {
            for (const noteKey of noteKeys) {
                this._setNotePlaying(componentId, noteKey, false);
            }
            return;
        }

        for (const noteKey of Object.keys(pan.noteElements)) {
            this._setNotePlaying(componentId, noteKey, false);
        }

        for (const noteKey of Object.keys(pan.labelElements)) {
            this._setNotePlaying(componentId, noteKey, false);
        }
    },

    flashNotes: function (componentId, noteKeys, durationMs) {
        if (!Array.isArray(noteKeys) || noteKeys.length === 0)
            return;

        this._ensureComponentScheduleState(componentId);

        for (const noteKey of noteKeys) {
            this._setNotePlaying(componentId, noteKey, true);
        }

        const timeoutId = window.setTimeout(() => {
            for (const noteKey of noteKeys) {
                this._setNotePlaying(componentId, noteKey, false);
            }
        }, Math.max(1, durationMs || 120));

        this._scheduledVisualTimersByComponent[componentId].push(timeoutId);
    },

    notePointerDown: async function (noteElement, labelElement, componentId, noteKey, event) {
        if (event.pointerType === "mouse" && event.button !== 0)
            return;

        event.stopPropagation();
        event.preventDefault();

        const ref = this._refs[componentId];
        if (!ref)
            return;

        await this.playNote(componentId, noteKey);

        this._setNotePlaying(componentId, noteKey, true);

        const timeoutId = window.setTimeout(() => {
            this._setNotePlaying(componentId, noteKey, false);
        }, 120);

        this._ensureComponentScheduleState(componentId);
        this._scheduledVisualTimersByComponent[componentId].push(timeoutId);
    },

    playMidiSchedule: async function (componentId, scheduledActions) {
        if (!Array.isArray(scheduledActions) || scheduledActions.length === 0)
            return null;

        const ctx = await this._ensureAudioContext();
        const startAt = ctx.currentTime + 0.05;

        await this.playMidiScheduleAt(componentId, scheduledActions, startAt);
        return startAt;
    },

    playMidiScheduleAt: async function (componentId, scheduledActions, startAt) {
        if (!Array.isArray(scheduledActions) || scheduledActions.length === 0)
            return null;

        const ctx = await this._ensureAudioContext();
        const actualStartAt = typeof startAt === "number" ? startAt : (ctx.currentTime + 0.05);

        this.stopMidiSchedule(componentId);
        this._ensureComponentScheduleState(componentId);

        const componentGain = await this._getOrCreateComponentGain(componentId);

        const uniqueNoteKeys = [...new Set(
            scheduledActions
                .map(action => action?.noteKey)
                .filter(noteKey => typeof noteKey === "string" && noteKey.length > 0)
        )];

        for (const noteKey of uniqueNoteKeys) {
            await this._loadBuffer(noteKey);
        }

        const sortedActions = scheduledActions
            .filter(action =>
                action &&
                typeof action.noteKey === "string" &&
                typeof action.timeSeconds === "number" &&
                typeof action.isNoteOn === "boolean")
            .sort((a, b) => a.timeSeconds - b.timeSeconds);

        const sources = this._scheduledSourcesByComponent[componentId];
        const perNoteMap = this._scheduledSourcesByNoteByComponent[componentId];
        const timers = this._scheduledVisualTimersByComponent[componentId];

        const noteOnActions = sortedActions.filter(action => action.isNoteOn);

        for (const action of noteOnActions) {
            const when = actualStartAt + action.timeSeconds;
            const buffer = await this._loadBuffer(action.noteKey);

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(componentGain);
            source.start(when);

            const normalizedNoteKey = this._normalizeEnharmonic(action.noteKey);

            const entry = {
                noteKey: normalizedNoteKey,
                source: source,
                startTime: when
            };

            sources.push(entry);

            if (!perNoteMap[normalizedNoteKey])
                perNoteMap[normalizedNoteKey] = [];

            perNoteMap[normalizedNoteKey].push(entry);

            source.onended = () => {
                const scheduledIndex = sources.indexOf(entry);
                if (scheduledIndex >= 0)
                    sources.splice(scheduledIndex, 1);

                const perNote = perNoteMap[normalizedNoteKey];
                if (!perNote)
                    return;

                const noteIndex = perNote.indexOf(entry);
                if (noteIndex >= 0)
                    perNote.splice(noteIndex, 1);

                if (perNote.length === 0)
                    delete perNoteMap[normalizedNoteKey];
            };
        }

        const noteOffActions = sortedActions.filter(action => !action.isNoteOn);

        for (const action of noteOffActions) {
            const normalizedNoteKey = this._normalizeEnharmonic(action.noteKey);
            const perNote = perNoteMap[normalizedNoteKey];
            if (!perNote || perNote.length === 0)
                continue;

            const when = actualStartAt + action.timeSeconds;

            let candidateIndex = -1;
            for (let i = 0; i < perNote.length; i++) {
                if (perNote[i].startTime <= when) {
                    candidateIndex = i;
                    break;
                }
            }

            if (candidateIndex < 0)
                continue;

            const entry = perNote[candidateIndex];

            try {
                entry.source.stop(when);
            } catch {
            }
        }

        for (const action of sortedActions) {
            const delayMs = Math.max(0, (actualStartAt + action.timeSeconds - ctx.currentTime) * 1000.0);

            const timeoutId = window.setTimeout(() => {
                this._setNotePlaying(componentId, action.noteKey, action.isNoteOn);
            }, delayMs);

            timers.push(timeoutId);
        }

        return actualStartAt;
    },

    playMetronomeSchedule: async function (actions, startAt) {
        if (!Array.isArray(actions) || actions.length === 0)
            return null;

        const ctx = await this._ensureAudioContext();
        const actualStartAt = startAt ?? (ctx.currentTime + 0.05);

        for (const action of actions) {
            if (!action || typeof action.timeSeconds !== "number")
                continue;

            const when = actualStartAt + action.timeSeconds;

            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.type = "square";
            oscillator.frequency.value = action.isAccent ? 1400 : 1000;

            gain.gain.setValueAtTime(0.0001, when);
            gain.gain.exponentialRampToValueAtTime(action.isAccent ? 0.25 : 0.15, when + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);

            oscillator.connect(gain);
            gain.connect(ctx.destination);

            oscillator.start(when);
            oscillator.stop(when + 0.07);

            this._metronomeNodes.push(oscillator);

            oscillator.onended = () => {
                const index = this._metronomeNodes.indexOf(oscillator);
                if (index >= 0)
                    this._metronomeNodes.splice(index, 1);
            };
        }

        return actualStartAt;
    },

    playMetronomeTick: async function (isAccent, when) {
        const ctx = await this._ensureAudioContext();
        const now = when ?? ctx.currentTime;

        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.type = "square";
        oscillator.frequency.value = isAccent ? 1400 : 1000;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(isAccent ? 0.25 : 0.15, now + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.start(now);
        oscillator.stop(now + 0.07);

        this._metronomeNodes.push(oscillator);

        oscillator.onended = () => {
            const index = this._metronomeNodes.indexOf(oscillator);
            if (index >= 0)
                this._metronomeNodes.splice(index, 1);
        };
    },

    stopMidiSchedule: function (componentId) {
        if (!componentId) {
            for (const id of Object.keys(this._scheduledSourcesByComponent)) {
                this.stopMidiSchedule(id);
            }
            return;
        }

        const sources = this._scheduledSourcesByComponent[componentId] || [];
        const timers = this._scheduledVisualTimersByComponent[componentId] || [];

        for (const entry of sources) {
            try {
                entry.source.stop();
            } catch {
            }
        }

        for (const timerId of timers) {
            window.clearTimeout(timerId);
        }

        this._scheduledSourcesByComponent[componentId] = [];
        this._scheduledSourcesByNoteByComponent[componentId] = {};
        this._scheduledVisualTimersByComponent[componentId] = [];
        this.clearPlayingVisuals(componentId);
    },

    stopMetronome: function () {
        for (const node of this._metronomeNodes) {
            try {
                node.stop();
            } catch {
            }
        }

        this._metronomeNodes = [];
    }
};