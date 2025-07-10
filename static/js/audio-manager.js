// Audio Management - Extracted from TextWindow
class AudioManager {
    constructor(windowId) {
        this.windowId = windowId;
    }
    
    createAudioControls(container, verseData, textarea) {
        const audioDiv = document.createElement('div');
        audioDiv.className = 'audio-controls absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1 z-50';
        audioDiv.innerHTML = `
            <select class="voice-selector text-xs px-2 py-1 border border-gray-300 bg-gray-100 text-gray-500 rounded-sm cursor-pointer hover:bg-gray-200 hover:text-gray-700 transition-all focus:outline-none">
                ${this.getVoiceOptions()}
            </select>
            <button class="tts-btn w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 rounded-sm hover:bg-gray-200 hover:text-gray-700 transition-all focus:outline-none" title="Generate audio">
                <i class="fas fa-microphone" style="font-size: 10px;"></i>
            </button>
            <button class="play-audio-btn w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 rounded-sm hover:bg-gray-200 hover:text-gray-700 transition-all focus:outline-none" title="Play audio" style="display: none;">
                <i class="fas fa-play" style="font-size: 10px;"></i>
            </button>
            <button class="pause-audio-btn w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 rounded-sm hover:bg-gray-200 hover:text-gray-700 transition-all focus:outline-none" title="Pause audio" style="display: none;">
                <i class="fas fa-pause" style="font-size: 10px;"></i>
            </button>
            <button class="audio-tuning-btn w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 rounded-sm hover:bg-blue-100 hover:text-blue-600 transition-all focus:outline-none" title="Audio settings" style="display: none;">
                <i class="fas fa-sliders-h" style="font-size: 10px;"></i>
            </button>
        `;
        
        container.appendChild(audioDiv);
        
        // Store audio state on the container
        audioDiv._currentAudio = null;
        audioDiv._audioId = null;
        
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
        const ttsBtn = audioControls.querySelector('.tts-btn');
        const playBtn = audioControls.querySelector('.play-audio-btn');
        const pauseBtn = audioControls.querySelector('.pause-audio-btn');
        const tuningBtn = audioControls.querySelector('.audio-tuning-btn');
        
        ttsBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const voice = audioControls.querySelector('.voice-selector').value;
            this.generateAudio(verseData, textarea.value, voice, audioControls);
        });
        
        playBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.playAudio(verseData, audioControls);
        });
        
        pauseBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.pauseAudio(audioControls);
        });
        
        tuningBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openAudioTuningModal(verseData, textarea, audioControls);
        });
    }
    
    async generateAudio(verseData, text, voice, audioControls) {
        if (!text?.trim()) return;
        
        const ttsBtn = audioControls.querySelector('.tts-btn');
        const originalContent = ttsBtn.innerHTML;
        
        try {
            ttsBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 10px;"></i>';
            ttsBtn.disabled = true;
            
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
            ttsBtn.innerHTML = originalContent;
            ttsBtn.disabled = false;
        }
    }
    
    async playAudio(verseData, audioControls) {
        const playBtn = audioControls.querySelector('.play-audio-btn');
        const pauseBtn = audioControls.querySelector('.pause-audio-btn');
        
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
            playBtn.style.display = 'none';
            pauseBtn.style.display = 'flex';
            
            audioControls._currentAudio.onended = () => {
                playBtn.style.display = 'flex';
                pauseBtn.style.display = 'none';
                audioControls._currentAudio = null;
            };
            
            audioControls._currentAudio.onerror = () => {
                playBtn.style.display = 'flex';
                pauseBtn.style.display = 'none';
                audioControls._currentAudio = null;
                alert('Failed to play audio');
            };
        } catch (error) {
            console.error('Audio play error:', error);
            playBtn.style.display = 'flex';
            pauseBtn.style.display = 'none';
        }
    }
    
    pauseAudio(audioControls) {
        const playBtn = audioControls.querySelector('.play-audio-btn');
        const pauseBtn = audioControls.querySelector('.pause-audio-btn');
        
        if (audioControls._currentAudio && !audioControls._currentAudio.paused) {
            audioControls._currentAudio.pause();
            playBtn.style.display = 'flex';
            pauseBtn.style.display = 'none';
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
        const playBtn = audioControls.querySelector('.play-audio-btn');
        const tuningBtn = audioControls.querySelector('.audio-tuning-btn');
        
        if (hasAudio) {
            playBtn.style.display = 'flex';
            tuningBtn.style.display = 'flex';
        } else {
            playBtn.style.display = 'none';
            tuningBtn.style.display = 'none';
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