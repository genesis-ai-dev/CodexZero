// Audio Management - Extracted from TextWindow
class AudioManager {
    constructor(windowId) {
        this.windowId = windowId;
        this.defaultVoice = 'onyx';
    }
    
    // Static method to get current global voice preference
    static getCurrentVoice() {
        return localStorage.getItem('preferredVoice') || 'onyx';
    }
    
    // Static method to set global voice preference and sync all dropdowns
    static setGlobalVoice(voice) {
        localStorage.setItem('preferredVoice', voice);
        // Update all voice dropdowns on the page
        document.querySelectorAll('.voice-text').forEach(voiceText => {
            voiceText.textContent = voice.charAt(0).toUpperCase() + voice.slice(1);
        });
    }
    
    createAudioControls(container, verseData, textarea) {
        const currentVoice = AudioManager.getCurrentVoice();
        
        // Create voice dropdown
        const voiceContainer = document.createElement('div');
        voiceContainer.className = 'relative';
        voiceContainer.innerHTML = `
            <button class="voice-selector-btn w-20 h-6 p-1 border border-neutral-200 bg-white rounded text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 flex items-center justify-between hover:bg-neutral-50" type="button">
                <span class="voice-text">${currentVoice.charAt(0).toUpperCase() + currentVoice.slice(1)}</span>
                <i class="fas fa-chevron-down text-neutral-400 transition-transform duration-200 voice-chevron" style="font-size: 6px;"></i>
            </button>
            <div class="voice-dropdown absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg hidden max-h-40 overflow-y-auto">
                ${this.getVoiceDropdownOptions()}
            </div>
        `;
        
        // Create buttons more efficiently
        const buttons = this.createAudioButtons();
        
        // Add all elements to container
        container.appendChild(voiceContainer);
        buttons.forEach(button => container.appendChild(button));
        
        // Store state and cache elements
        container._currentAudio = null;
        container._audioId = null;
        container._elements = {
            voiceSelectorBtn: voiceContainer.querySelector('.voice-selector-btn'),
            voiceDropdown: voiceContainer.querySelector('.voice-dropdown'),
            voiceText: voiceContainer.querySelector('.voice-text'),
            voiceChevron: voiceContainer.querySelector('.voice-chevron'),
            ...buttons.reduce((acc, btn, idx) => {
                const names = ['ttsBtn', 'playBtn', 'pauseBtn', 'tuningBtn'];
                acc[names[idx]] = btn;
                return acc;
            }, {})
        };
        
        this.setupAudioListeners(verseData, textarea, container);
        this.setupVoiceDropdown(container);
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
    

    
    getVoiceDropdownOptions() {
        const voices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
        return voices.map(voice => 
            `<div class="voice-option px-3 py-2 text-xs text-neutral-700 hover:bg-blue-50 hover:text-blue-900 cursor-pointer border-b border-neutral-100 last:border-b-0" data-voice="${voice}">
                <div class="font-medium">${voice.charAt(0).toUpperCase() + voice.slice(1)}</div>
            </div>`
        ).join('');
    }
    
    setupAudioListeners(verseData, textarea, audioControls) {
        // PERFORMANCE: Use cached elements
        const elements = audioControls._elements;
        
        elements.ttsBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const voice = AudioManager.getCurrentVoice(); // Use global voice preference
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
    
    setupVoiceDropdown(audioControls) {
        const elements = audioControls._elements;
        
        // Toggle dropdown
        elements.voiceSelectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown(elements);
        });
        
        // Handle voice selection with global sync
        elements.voiceDropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.voice-option');
            if (option) {
                const voice = option.dataset.voice;
                AudioManager.setGlobalVoice(voice); // This syncs all dropdowns
                this.closeDropdown(elements);
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!audioControls.contains(e.target)) {
                this.closeDropdown(elements);
            }
        });
    }
    
    toggleDropdown(elements) {
        const isOpen = !elements.voiceDropdown.classList.contains('hidden');
        
        // Close all other dropdowns first
        this.closeAllDropdowns();
        
        // Toggle this dropdown
        if (isOpen) {
            this.closeDropdown(elements);
        } else {
            this.openDropdown(elements);
        }
    }
    
    openDropdown(elements) {
        elements.voiceDropdown.classList.remove('hidden');
        elements.voiceChevron.style.transform = 'rotate(180deg)';
    }
    
    closeDropdown(elements) {
        elements.voiceDropdown.classList.add('hidden');
        elements.voiceChevron.style.transform = 'rotate(0deg)';
    }
    
    closeAllDropdowns() {
        document.querySelectorAll('.voice-dropdown').forEach(dropdown => {
            dropdown.classList.add('hidden');
            const chevron = dropdown.parentElement.querySelector('.voice-chevron');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
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
            
            // Show verse download button if it exists
            const verseWrapper = audioControls.closest('[data-verse-cell]');
            if (verseWrapper && verseWrapper._audioDownloadButton) {
                verseWrapper._audioDownloadButton.style.display = 'flex';
            }
        } else {
            elements.playBtn.style.display = 'none';
            elements.tuningBtn.style.display = 'none';
            
            // Hide verse download button if it exists
            const verseWrapper = audioControls.closest('[data-verse-cell]');
            if (verseWrapper && verseWrapper._audioDownloadButton) {
                verseWrapper._audioDownloadButton.style.display = 'none';
            }
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