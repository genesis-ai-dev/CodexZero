// Audio Management - Extracted from TextWindow
class AudioManager {
    constructor(windowId) {
        this.windowId = windowId;
        this.defaultVoice = 'onyx';
    }
    
    // Voice is fixed to onyx - no preference needed
    
    createAudioControls(container, verseData, textarea) {
        // Create buttons efficiently
        const buttons = this.createAudioButtons();
        
        // Add buttons to container
        buttons.forEach(button => container.appendChild(button));
        
        // Store state and cache elements
        container._currentAudio = null;
        container._audioId = null;
        container._elements = {
            ...buttons.reduce((acc, btn, idx) => {
                const names = ['ttsBtn', 'playBtn', 'pauseBtn', 'tuningBtn'];
                acc[names[idx]] = btn;
                return acc;
            }, {})
        };
        
        this.setupAudioListeners(verseData, textarea, container);
        this.checkExistingAudio(container, verseData);
        
        return container;
    }
    
    createAudioButtons() {
        const buttonConfigs = [
            { class: 'tts-btn', icon: 'fa-volume-up', size: '10px', title: 'Generate audio', display: 'flex' },
            { class: 'play-audio-btn', icon: 'fa-play', size: '8px', title: 'Play audio', display: 'none' },
            { class: 'pause-audio-btn', icon: 'fa-pause', size: '8px', title: 'Pause audio', display: 'none' },
            { class: 'audio-tuning-btn', icon: 'fa-sliders-h', size: '8px', title: 'Audio settings', display: 'none' }
        ];
        
        return buttonConfigs.map(config => {
            const button = document.createElement('button');
            button.className = `${config.class} w-6 h-6 flex items-center justify-center bg-white border border-neutral-200 text-neutral-600 rounded hover:bg-neutral-50 hover:text-neutral-900 focus:outline-none transition-all duration-200 shadow-sm`;
            button.title = config.title;
            button.style.display = config.display;
            button.innerHTML = `<i class="fas ${config.icon}" style="font-size: ${config.size};"></i>`;
            return button;
        });
    }
    

    
    // Voice dropdown removed - using fixed onyx voice
    
    setupAudioListeners(verseData, textarea, audioControls) {
        // PERFORMANCE: Use cached elements
        const elements = audioControls._elements;
        
        elements.ttsBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const voice = 'onyx'; // Fixed to onyx voice
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
    
    // Voice dropdown setup removed - using fixed onyx voice
    
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
                // Auto-play immediately after generation
                setTimeout(() => {
                    this.playAudio(verseData, audioControls);
                }, 300);
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