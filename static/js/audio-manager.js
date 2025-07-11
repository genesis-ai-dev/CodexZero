// Audio Management - Extracted from TextWindow
class AudioManager {
    constructor(windowId) {
        this.windowId = windowId;
    }
    
    createAudioControls(container, verseData, textarea) {
        const audioDiv = document.createElement('div');
        audioDiv.className = 'audio-controls absolute top-1 left-2 opacity-100 flex items-center gap-1 z-50';
        audioDiv.innerHTML = `
            <select class="voice-selector text-xs px-1 py-0 border border-gray-300 bg-gray-100 text-gray-500 rounded cursor-pointer focus:outline-none h-5 text-xs leading-none" style="font-size: 10px;">
                ${this.getVoiceOptions()}
            </select>
            <button class="tts-btn w-5 h-5 flex items-center justify-center bg-gray-100 text-gray-500 rounded focus:outline-none" title="Generate audio">
                <i class="fas fa-microphone" style="font-size: 8px;"></i>
            </button>
            <button class="play-audio-btn w-5 h-5 flex items-center justify-center bg-gray-100 text-gray-500 rounded focus:outline-none" title="Play audio" style="display: none;">
                <i class="fas fa-play" style="font-size: 8px;"></i>
            </button>
            <button class="pause-audio-btn w-5 h-5 flex items-center justify-center bg-gray-100 text-gray-500 rounded focus:outline-none" title="Pause audio" style="display: none;">
                <i class="fas fa-pause" style="font-size: 8px;"></i>
            </button>
            <button class="audio-tuning-btn w-5 h-5 flex items-center justify-center bg-gray-100 text-gray-500 rounded focus:outline-none" title="Audio settings" style="display: none;">
                <i class="fas fa-sliders-h" style="font-size: 8px;"></i>
            </button>
        `;
        
        container.appendChild(audioDiv);
        
        // Store audio state on the container
        audioDiv._currentAudio = null;
        audioDiv._audioId = null;
        
        // PERFORMANCE: Cache all button elements once
        const elements = {
            voiceSelector: audioDiv.querySelector('.voice-selector'),
            ttsBtn: audioDiv.querySelector('.tts-btn'),
            playBtn: audioDiv.querySelector('.play-audio-btn'),
            pauseBtn: audioDiv.querySelector('.pause-audio-btn'),
            tuningBtn: audioDiv.querySelector('.audio-tuning-btn')
        };
        audioDiv._elements = elements;
        
        this.setupAudioListeners(verseData, textarea, audioDiv);
        this.checkExistingAudio(audioDiv, verseData);
        
        return audioDiv;
    }
    
    getVoiceOptions() {
        const voices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
        return voices.map(voice => 
            `<option value="${voice}" ${voice === 'onyx' ? 'selected' : ''}>${voice.charAt(0).toUpperCase() + voice.slice(1)}</option>`
        ).join('');
    }
    
    setupAudioListeners(verseData, textarea, audioControls) {
        // PERFORMANCE: Use cached elements
        const elements = audioControls._elements;
        
        elements.ttsBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const voice = elements.voiceSelector.value;
            this.generateAudio(verseData, textarea.value, voice, audioControls);
        });
        
        elements.playBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.playAudio(verseData, audioControls);
        });
        
        elements.pauseBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.pauseAudio(audioControls);
        });
        
        elements.tuningBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openAudioTuningModal(verseData, textarea, audioControls);
        });
    }
    
    async generateAudio(verseData, text, voice, audioControls) {
        if (!text?.trim()) return;
        
        // PERFORMANCE: Use cached elements
        const elements = audioControls._elements;
        const originalContent = elements.ttsBtn.innerHTML;
        
        try {
            elements.ttsBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 10px;"></i>';
            elements.ttsBtn.disabled = true;
            
            const projectId = window.location.pathname.split('/')[2];
            const response = await fetch(`/project/${projectId}/verse-audio/${this.windowId}/${verseData.index}/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    voice: voice
                })
            });
            
            const data = await response.json();
            if (data.success) {
                audioControls._audioId = data.audio_id;
                this.showAudioButtons(audioControls, true);
                this.playAudio(verseData, audioControls);
            }
        } catch (error) {
            console.error('Audio generation error:', error);
        } finally {
            elements.ttsBtn.innerHTML = originalContent;
            elements.ttsBtn.disabled = false;
        }
    }
    
    async playAudio(verseData, audioControls) {
        // PERFORMANCE: Use cached elements
        const elements = audioControls._elements;
        
        if (audioControls._currentAudio && !audioControls._currentAudio.paused) {
            this.pauseAudio(audioControls);
            return;
        }
        
        try {
            let audioId = audioControls._audioId;
            if (!audioId) {
                const projectId = window.location.pathname.split('/')[2];
                const response = await fetch(`/project/${projectId}/verse-audio/${this.windowId}/${verseData.index}/check`);
                const data = await response.json();
                if (!data.exists) {
                    alert('No audio available. Generate audio first.');
                    return;
                }
                audioId = data.audio_id;
                audioControls._audioId = audioId;
            }
            
            const projectId = window.location.pathname.split('/')[2];
            const audioUrl = `/project/${projectId}/verse-audio/${audioId}/download`;
            audioControls._currentAudio = new Audio(audioUrl);
            
            audioControls._currentAudio.play();
            elements.playBtn.style.display = 'none';
            elements.pauseBtn.style.display = 'flex';
            
            audioControls._currentAudio.onended = () => {
                elements.playBtn.style.display = 'flex';
                elements.pauseBtn.style.display = 'none';
                audioControls._currentAudio = null;
            };
            
            audioControls._currentAudio.onerror = () => {
                elements.playBtn.style.display = 'flex';
                elements.pauseBtn.style.display = 'none';
                audioControls._currentAudio = null;
                alert('Failed to play audio');
            };
        } catch (error) {
            console.error('Audio play error:', error);
            elements.playBtn.style.display = 'flex';
            elements.pauseBtn.style.display = 'none';
        }
    }
    
    pauseAudio(audioControls) {
        // PERFORMANCE: Use cached elements
        const elements = audioControls._elements;
        
        if (audioControls._currentAudio && !audioControls._currentAudio.paused) {
            audioControls._currentAudio.pause();
            elements.playBtn.style.display = 'flex';
            elements.pauseBtn.style.display = 'none';
        }
    }
    
    openAudioTuningModal(verseData, textarea, audioControls) {
        const projectId = window.location.pathname.split('/')[2];
        const modalData = {
            projectId: projectId,
            textId: this.windowId,
            verseIndex: verseData.index,
            originalText: textarea.value,
            onApply: (audioId) => {
                if (audioId) {
                    audioControls._audioId = audioId;
                    this.showAudioButtons(audioControls, true);
                } else {
                    audioControls._audioId = null;
                    this.showAudioButtons(audioControls, false);
                }
            }
        };
        
        if (window.AudioTuningModal) {
            window.AudioTuningModal.open(modalData);
        }
    }
    
    showAudioButtons(audioControls, hasAudio) {
        // PERFORMANCE: Use cached elements
        const elements = audioControls._elements;
        
        if (hasAudio) {
            elements.playBtn.style.display = 'flex';
            elements.tuningBtn.style.display = 'flex';
        } else {
            elements.playBtn.style.display = 'none';
            elements.tuningBtn.style.display = 'none';
        }
    }
    
    async checkExistingAudio(audioControls, verseData) {
        try {
            const projectId = window.location.pathname.split('/')[2];
            const response = await fetch(`/project/${projectId}/verse-audio/${this.windowId}/${verseData.index}/check`);
            const data = await response.json();
            if (data.exists) {
                audioControls._audioId = data.audio_id;
                this.showAudioButtons(audioControls, true);
            }
        } catch (error) {
            // No existing audio - this is fine, just don't show buttons
        }
    }
}

// Make available globally
window.AudioManager = AudioManager; 