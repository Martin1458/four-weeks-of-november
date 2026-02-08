console.log('inject.js loaded!');
// Inject a static black pill at the bottom left of the page
console.log('Starting inject.js script...');

const pill = document.getElementById('chrome-timer-pill') || document.createElement('div');
if (!pill.id) pill.id = 'chrome-timer-pill';
console.log('Created pill element:', pill);
pill.style.position = 'fixed';
pill.style.left = '24px';
pill.style.bottom = '24px';
pill.style.zIndex = '99999';
pill.style.background = '#000';
pill.style.borderRadius = '1000px';
pill.style.minWidth = '120px';
pill.style.display = 'flex';
pill.style.alignItems = 'center';
pill.style.justifyContent = 'center';
pill.style.boxShadow = '0 4px 24px 0 rgba(0,0,0,0.18)';
pill.style.padding = '6px 8px';
pill.style.color = '#fff';
pill.style.fontSize = '26px';
pill.style.fontFamily = "Poppins";
pill.style.fontWeight = '500';
pill.style.letterSpacing = '-0.5px';
pill.style.minHeight = '34px';
pill.style.flexShrink = '0';
pill.style.maxWidth = '320px';
pill.style.margin = '0';
pill.style.transition = 'min-width 0.5s cubic-bezier(.68,-0.60,.27,1.65), max-width 0.5s cubic-bezier(.68,-0.60,.27,1.65), background 0.3s cubic-bezier(.68,-0.60,.27,1.65)';
console.log('About to append pill to document.body');

let timerValue = 300; // default 5 minutes in seconds
let editing = false;
let running = false;
let interval = null;
let maxTimerValue = timerValue;
let startedAt = null; // Store the actual start time
let countdownEventName = 'Investor Meeting';

// Global cache for custom colors
window.cachedCustomColors = null;

// Fetch and cache custom colors on load
if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get('customColors', (result) => {
    window.cachedCustomColors = result.customColors || {};
    if (window.cachedCustomColors.secondary) {
      applyCustomColorsToAccents(window.cachedCustomColors.secondary);
    }
  });
}

// Listen for changes to customColors and update cache/UI
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.customColors && changes.customColors.newValue) {
      window.cachedCustomColors = changes.customColors.newValue;
      if (window.cachedCustomColors.secondary) {
        applyCustomColorsToAccents(window.cachedCustomColors.secondary);
      }
    }
  });
}

// Listen for changes to hideCountdown and update countdown pill visibility immediately
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.hideCountdown) {
      const countdownPill = document.getElementById('chrome-countdown-pill');
      if (countdownPill) {
        countdownPill.style.display = changes.hideCountdown.newValue ? 'none' : 'flex';
      }
    }
    
    // Listen for changes to timerOff and update timer pill visibility immediately
    if (area === 'local' && changes.timerOff) {
      const timerPill = document.getElementById('chrome-timer-pill');
      if (timerPill) {
        timerPill.style.display = changes.timerOff.newValue ? 'none' : 'flex';
      }
    }
  });
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatInputTime(str) {
  const digits = str.replace(/\D/g, '');
  if (digits.length > 4) {
    // H:MM:SS
    const h = digits.slice(0, digits.length - 4);
    const m = digits.slice(-4, -2);
    const s = digits.slice(-2);
    return `${parseInt(h, 10)}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
  } else if (digits.length > 2) {
    // MM:SS
    const m = digits.slice(0, digits.length - 2);
    const s = digits.slice(-2);
    return `${parseInt(m, 10)}:${s.padStart(2, '0')}`;
  } else {
    // SS
    return digits;
  }
}

function parseInputTime(str) {
  str = str.trim();
  let match = str.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (match) {
    return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
  }
  match = str.match(/^(\d+):(\d{1,2})$/);
  if (match) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  return null;
}

function calculateRemainingTime() {
  if (!startedAt || !running) {
    return timerValue;
  }
  
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const remaining = Math.max(0, maxTimerValue - elapsed);
  
  // If timer has finished, stop it
  if (remaining === 0 && running) {
    running = false;
    clearInterval(interval);
    interval = null;
    
    // Save expired status to chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ timerState: "expired" }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage error during timer expiration:', chrome.runtime.lastError);
        } else {
          console.log("[Timer State] Timer expired and state saved to storage");
        }
      });
    }
    
    // Update storage to reflect timer completion
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('timer', (result) => {
        const currentTimer = result.timer || {};
        const updatedTimer = {
          ...currentTimer,
          running: false,
          remaining: 0,
          now: Date.now()
        };
        
        chrome.storage.local.set({ timer: updatedTimer }, () => {
          if (chrome.runtime.lastError) {
            console.error('Storage error during timer completion:', chrome.runtime.lastError);
          } else {
            console.log('[Timer Completed]', updatedTimer);
          }
        });
      });
    }
  }
  
  return remaining;
}

function startCountdown() {
  if (interval) clearInterval(interval);
  
  // Set the start time when countdown begins
  if (!startedAt) {
    startedAt = Date.now();
  }
  
  interval = setInterval(() => {
    if (running && !editing) {
      timerValue = calculateRemainingTime();
      renderTimer();
    }
  }, 1000);
}

function stopCountdown() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

function setupInputEnterLogging() {
  // Wait for the input to exist in the DOM
  const input = pill.querySelector('input[type="text"]');
  if (!input) return;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Take value, convert to seconds, create timer object, save to storage, log
      let val = input.value.trim();
      let duration = 0;
      if (val) {
        const parsed = parseInputTime(val);
        if (!isNaN(parsed) && parsed > 0) duration = parsed;
      }
      
      // Clear existing timer data and create a completely new timer
      chrome.storage.local.remove('timer', () => {
        const now = Date.now();
        const timer = {
          startedAt: now,
          duration: duration,
          running: true,
          remaining: duration,
          now: now // current live Unix timestamp
        };
        chrome.storage.local.set({ timer: timer }, () => {
          console.log('[Timer Reset Manually]', timer);
        });
      });
      
      // Start countdown
      if (window._pillCountdown) clearInterval(window._pillCountdown);
      function tick() {
        const elapsed = Math.floor((Date.now() - now) / 1000);
        const remaining = Math.max(0, duration - elapsed);
        input.value = formatTime(remaining);
        if (remaining === 0 && window._pillCountdown) {
          clearInterval(window._pillCountdown);
          window._pillCountdown = null;
          
          // Save expired status to chrome.storage.local
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ timerState: "expired" }, () => {
              if (chrome.runtime.lastError) {
                console.error('Storage error during timer expiration:', chrome.runtime.lastError);
              } else {
                console.log("[Timer State] Timer expired and state saved to storage");
              }
            });
          }
        }
      }
      tick();
      window._pillCountdown = setInterval(tick, 1000);
    }
  });
  // Also handle Start button click
  const startBtn = pill.querySelector('button');
  if (startBtn) {
    startBtn.addEventListener('click', function(e) {
      if (!editing) {
        let val = input.value.trim();
        let duration = 0;
        if (val) {
          const parsed = parseInputTime(val);
          if (!isNaN(parsed) && parsed > 0) duration = parsed;
        }
        
        // Clear existing timer data and create a completely new timer
        chrome.storage.local.remove('timer', () => {
          const now = Date.now();
          const timer = {
            startedAt: now,
            duration: duration,
            running: true,
            remaining: duration,
            now: now
          };
          chrome.storage.local.set({ timer: timer }, () => {
            console.log('[Timer Reset Manually]', timer);
          });
        });
        
        // Start countdown
        if (window._pillCountdown) clearInterval(window._pillCountdown);
        function tick() {
          const elapsed = Math.floor((Date.now() - now) / 1000);
          const remaining = Math.max(0, duration - elapsed);
          input.value = formatTime(remaining);
          if (remaining === 0 && window._pillCountdown) {
            clearInterval(window._pillCountdown);
            window._pillCountdown = null;
            
            // Save expired status to chrome.storage.local
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({ timerState: "expired" }, () => {
                if (chrome.runtime.lastError) {
                  console.error('Storage error during timer expiration:', chrome.runtime.lastError);
                } else {
                  console.log("[Timer State] Timer expired and state saved to storage");
                }
              });
            }
          }
        }
        tick();
        window._pillCountdown = setInterval(tick, 1000);
      }
    });
  }
}

// Utility to convert hex color to rgba with given alpha
function hexToRgba(hex, alpha) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(x => x + x).join('');
  }
  const num = parseInt(hex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyCustomColorsToAccents(secondaryColor) {
  document.querySelectorAll('.pill-container button svg').forEach(svg => {
    svg.setAttribute('fill', secondaryColor);
  });
  document.querySelectorAll('.countdown-icon').forEach(svg => {
    svg.setAttribute('fill', secondaryColor);
  });
  document.querySelectorAll('.pill-container svg').forEach(svg => {
    const circles = svg.querySelectorAll('circle');
    if (circles.length > 1) {
      circles[1].setAttribute('stroke', secondaryColor);
    }
  });
  const bgColor = hexToRgba(secondaryColor, 0.4);
  document.querySelectorAll('.pill-container button').forEach(btn => {
    btn.style.background = bgColor;
  });
}

// Utility to increase brightness of a hex color by a percentage
function brightenHex(hex, percent) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(x => x + x).join('');
  }
  let num = parseInt(hex, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  r = Math.min(255, Math.round(r + (255 - r) * percent));
  g = Math.min(255, Math.round(g + (255 - g) * percent));
  b = Math.min(255, Math.round(b + (255 - b) * percent));
  return `rgb(${r}, ${g}, ${b})`;
}

function updatePulseAnimation(baseColor) {
  // Remove old style if exists
  const oldStyle = document.getElementById('pill-pulse-style');
  if (oldStyle) oldStyle.remove();
  // Calculate brighter color
  const brightColor = brightenHex(baseColor, 0.2);
  // Add new style
  const style = document.createElement('style');
  style.id = 'pill-pulse-style';
  style.textContent = `
    .pill-pulse {
      animation: pillPulse 1.2s infinite alternate cubic-bezier(.68,-0.60,.27,1.65);
    }
    @keyframes pillPulse {
      0% { background: ${baseColor}; }
      100% { background: ${brightColor}; }
    }
  `;
  document.head.appendChild(style);
}

// Patch renderTimer to use custom pulse color
const originalRenderTimer2 = renderTimer;
renderTimer = function() {
  originalRenderTimer2.apply(this, arguments);
  if (timerValue === 0 && window.cachedCustomColors && window.cachedCustomColors.secondary) {
    updatePulseAnimation(window.cachedCustomColors.secondary);
  }
};

const originalSetupCountdownPill = setupCountdownPill;
setupCountdownPill = function() {
  originalSetupCountdownPill.apply(this, arguments);
  if (window.cachedCustomColors && window.cachedCustomColors.secondary) {
    applyCustomColorsToAccents(window.cachedCustomColors.secondary);
  }
};

function getSecondsPassed() {
  if (!startedAt) return 0;
  const passed = Math.floor((Date.now() - startedAt) / 1000);
  console.log('Seconds passed:', passed);
  return passed;
}

function renderTimer() {
  pill.innerHTML = '';
  // Remove any previous pulse animation
  pill.style.animation = '';
  pill.classList.remove('pill-pulse');
  // Use custom color for pulse if timerValue is 0
  let accentColor = (window.cachedCustomColors && window.cachedCustomColors.secondary) ? window.cachedCustomColors.secondary : '#ff3d00';
  // Change background to accent color and double pill length when timer reaches 0
  if (timerValue === 0) {
    pill.style.background = accentColor;
    pill.style.minWidth = '240px'; // Double the default minWidth (120px)
    pill.style.maxWidth = '640px'; // Double the default maxWidth (320px)
    pill.classList.add('pill-pulse');
  } else {
    pill.style.background = '#000'; // Default black background
    pill.style.minWidth = '120px'; // Restore default minWidth
    pill.style.maxWidth = '320px'; // Restore default maxWidth
  }
  
  // Only show play/pause button and progress ring if timer is not expired
  if (timerValue !== 0) {
    // Play/Pause button
    const playBtn = document.createElement('button');
    // Use custom color for button background
    const btnBg = hexToRgba(accentColor, 0.4);
    playBtn.style.background = btnBg;
    playBtn.style.border = 'none';
    playBtn.style.borderRadius = '50%'; // Make it circular
    playBtn.style.marginRight = '12px';
    playBtn.style.cursor = editing ? 'default' : 'pointer';
    playBtn.style.width = '32px';
    playBtn.style.height = '32px';
    playBtn.style.display = 'flex';
    playBtn.style.alignItems = 'center';
    playBtn.style.justifyContent = 'center';
    playBtn.style.padding = '0';
    playBtn.style.flexShrink = '0'; // Prevent button from shrinking
    playBtn.style.minWidth = '32px'; // Ensure minimum width
    playBtn.style.minHeight = '32px'; // Ensure minimum height
    
    // Add SVG icon based on running state, using accentColor
    if (running) {
      playBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="70%" height="70%" fill="${accentColor}" class="bi bi-pause-fill" viewBox="0 0 16 16">
          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5m5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5"/>
        </svg>
      `;
    } else {
      playBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="70%" height="70%" fill="${accentColor}" class="bi bi-play-fill" viewBox="0 0 16 16">
          <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393"/>
        </svg>
      `;
    }
    
    playBtn.onclick = (e) => {
      e.stopPropagation();
      if (editing) return;
      
      console.log('Button clicked! Current running state:', running);
      
      if (running) {
        // Pausing the timer
        console.log('Pausing timer...');
        running = false;
        stopCountdown();
        
        // Calculate current remaining time before pausing
        timerValue = calculateRemainingTime();
        
        // Record the exact time the pause happened
        const pausedAt = Date.now();
        console.log('Pause timestamp:', pausedAt);
        
        // Get current timer state from storage and update it
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get('timer', (result) => {
            console.log('Current timer from storage:', result.timer);
            const currentTimer = result.timer || {};
            const updatedTimer = {
              ...currentTimer,
              running: false,
              pausedAt: pausedAt,
              remaining: timerValue,
              now: pausedAt
            };
            
            console.log('Updated timer object:', updatedTimer);
            
            // Save the updated timer state
            chrome.storage.local.set({ timer: updatedTimer }, () => {
              if (chrome.runtime.lastError) {
                console.error('Storage error:', chrome.runtime.lastError);
              } else {
                console.log('[Timer Paused]', updatedTimer);
              }
            });
          });
        } else {
          console.error('chrome.storage.local is not available');
          console.log('[Timer Paused] - Local state only', {
            running: false,
            pausedAt: pausedAt,
            remaining: timerValue,
            now: pausedAt
          });
        }
      } else {
        // Resuming the timer
        console.log('Resuming timer...');
        
        // Get current timer state from storage and update it
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get('timer', (result) => {
            const currentTimer = result.timer || {};
            
            if (currentTimer.pausedAt) {
              // Calculate how long the timer was paused
              const timePaused = Date.now() - currentTimer.pausedAt;
              console.log('Time paused:', timePaused, 'ms');
              
              // Shift timer.startedAt forward by the pause duration
              const updatedStartedAt = currentTimer.startedAt + timePaused;
              console.log('Original startedAt:', currentTimer.startedAt);
              console.log('Updated startedAt:', updatedStartedAt);
              
              // Update local startedAt to match
              startedAt = updatedStartedAt;
              
              // Create updated timer object
              const updatedTimer = {
                ...currentTimer,
                startedAt: updatedStartedAt,
                running: true,
                pausedAt: null,
                now: Date.now()
              };
              
              // Save the updated timer state
              chrome.storage.local.set({ timer: updatedTimer }, () => {
                if (chrome.runtime.lastError) {
                  console.error('Storage error during resume:', chrome.runtime.lastError);
                } else {
                  console.log('[Timer Resumed]', updatedTimer);
                }
              });
            } else {
              console.log('No pausedAt found, treating as new timer start');
              // If no pausedAt, treat as a new timer start
              const now = Date.now();
              startedAt = now;
              const updatedTimer = {
                ...currentTimer,
                startedAt: now,
                running: true,
                pausedAt: null,
                now: now
              };
              
              chrome.storage.local.set({ timer: updatedTimer }, () => {
                if (chrome.runtime.lastError) {
                  console.error('Storage error during new start:', chrome.runtime.lastError);
                } else {
                  console.log('[Timer Resumed]', updatedTimer);
                }
              });
            }
          });
        } else {
          console.error('chrome.storage.local is not available during resume');
          // Set local startedAt for consistency
          startedAt = Date.now();
        }
        
        running = true;
        startCountdown();
      }
      
      renderTimer();
    };
    pill.appendChild(playBtn);
  }

  // Timer display
  if (editing) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = formatTime(timerValue);
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.color = '#fff';
    input.style.fontSize = '26px';
    input.style.fontFamily = "Poppins";
    input.style.fontWeight = '500';
    input.style.letterSpacing = '-0.5px';
    input.style.textAlign = 'center';
    input.style.width = '70px';
    input.style.outline = 'none';
    input.style.boxShadow = 'none';
    input.style.caretColor = '#fff';
    input.onkeydown = (e) => {
      if (e.key === 'Enter') saveEdit();
      else if (e.key === 'Escape') cancelEdit();
    };
    input.onblur = saveEdit;
    input.addEventListener('input', () => {
      input.value = formatInputTime(input.value);
    });
    pill.appendChild(input);
    input.focus();
    input.select();
    function saveEdit() {
      const val = parseInputTime(input.value);
      if (val !== null && val > 0) {
        timerValue = val;
        maxTimerValue = val;
        
        // Log the edit action
        console.log('[Timer Edited]', {
          newValue: val,
          formattedTime: formatTime(val),
          inputValue: input.value,
          timestamp: Date.now()
        });
        
        // Save to chrome.storage.local
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get('timer', (result) => {
            const currentTimer = result.timer || {};
            const updatedTimer = {
              ...currentTimer,
              duration: val,
              remaining: val,
              editedAt: Date.now(),
              now: Date.now()
            };
            
            chrome.storage.local.set({ timer: updatedTimer }, () => {
              if (chrome.runtime.lastError) {
                console.error('Storage error during edit:', chrome.runtime.lastError);
              } else {
                console.log('[Timer Edit Saved]', updatedTimer);
              }
            });
          });
        } else {
          console.error('chrome.storage.local is not available during edit');
        }
      }
      editing = false;
      renderTimer();
    }
    function cancelEdit() {
      editing = false;
      renderTimer();
    }
  } else {
    const timerText = document.createElement('span');
    timerText.textContent = timerValue === 0 ? "Time's Up" : formatTime(timerValue);
    timerText.style.cursor = 'pointer';
    timerText.style.minWidth = '70px';
    timerText.style.textAlign = 'center';
    timerText.style.display = 'inline-block';

    if (timerValue === 0) {
      // When timer is expired, clicking resets it to its default state and syncs across tabs
      timerText.style.color = '#111'; // Black text
      timerText.onclick = () => {
        timerValue = 300; // Reset to default 5 minutes
        maxTimerValue = 300;
        running = false;
        startedAt = null;

        // Update the shared state in chrome.storage.local to signal reset
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const now = Date.now();
          const timer = {
            startedAt: null,
            duration: 300,
            running: false,
            remaining: 300,
            now: now
          };
          chrome.storage.local.set({ timerState: 'running', timer: timer }, () => {
            console.log('[Timer State] Timer reset and state set to running.');
          });
        }
        
        renderTimer(); // Re-render the timer in its default state
      };
    } else {
      // When timer is running or paused, clicking allows editing
      timerText.onclick = () => {
        editing = true;
        renderTimer();
      };
    }
    pill.appendChild(timerText);
  }

  // Only show progress ring if timer is not expired
  if (timerValue !== 0) {
    const ringSize = 32;
    const stroke = 5;
    const radius = (ringSize - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const percent = timerValue / maxTimerValue;
    const offset = circumference * (1 - percent);
    const ringDiv = document.createElement('div');
    ringDiv.style.marginLeft = '12px';
    ringDiv.style.display = 'flex';
    ringDiv.style.alignItems = 'center';
    ringDiv.style.flexShrink = '0';
    ringDiv.innerHTML = `
      <svg width="${ringSize}" height="${ringSize}" viewBox="0 0 ${ringSize} ${ringSize}">
        <circle cx="${ringSize/2}" cy="${ringSize/2}" r="${radius}" stroke="rgba(255, 255, 255, 0.15)" stroke-width="${stroke}" fill="none" />
        <circle cx="${ringSize/2}" cy="${ringSize/2}" r="${radius}" stroke="${accentColor}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" />
      </svg>
    `;
    pill.appendChild(ringDiv);
  }

  setupInputEnterLogging();
}

renderTimer();

// Inject Poppins font with all needed weights and font-display=swap as early as possible
if (!document.getElementById('pill-poppins-font')) {
  const link = document.createElement('link');
  link.id = 'pill-poppins-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css?family=Poppins:300,400,500,600,700&display=swap';
  document.head.prepend(link);
}
// Add a CSS rule to force font-weight: 500 !important and a modern font stack on pill text elements
if (!document.getElementById('pill-poppins-force-weight')) {
  const style = document.createElement('style');
  style.id = 'pill-poppins-force-weight';
  style.textContent = `
    .pill-container, .pill-container * {
      font-family: Poppins, Inter, Roboto, 'Segoe UI', 'Helvetica Neue', Arial, 'Noto Sans', sans-serif !important;
      font-weight: 500 !important;
    }
  `;
  document.head.appendChild(style);
}

console.log('inject.js loaded');
chrome.storage.local.get('timer', (result) => {
  console.log('Storage result:', result);
  if (result && result.timer) {
    console.log('[Timer Load]', result.timer);
    // Initialize local state from storage on load
    const storedTimer = result.timer;
    maxTimerValue = storedTimer.duration || 300;
    running = !!storedTimer.running;
    
    // Set startedAt from storage if timer is running
    if (running && storedTimer.startedAt) {
      startedAt = storedTimer.startedAt;
      // Calculate the current remaining time based on actual elapsed time
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      timerValue = Math.max(0, maxTimerValue - elapsed);
      
      // If timer has actually finished, update the state
      if (timerValue === 0) {
        running = false;
        // Update storage to reflect timer completion
        const updatedTimer = {
          ...storedTimer,
          running: false,
          remaining: 0,
          now: Date.now()
        };
        chrome.storage.local.set({ timer: updatedTimer }, () => {
          if (chrome.runtime.lastError) {
            console.error('Storage error during timer completion on load:', chrome.runtime.lastError);
          } else {
            console.log('[Timer Completed on Load]', updatedTimer);
          }
        });
      }
    } else {
      // Timer is not running, use the stored remaining value or duration
      if (typeof storedTimer.remaining === 'number') {
        timerValue = storedTimer.remaining;
      } else {
        timerValue = storedTimer.duration || 300;
      }
    }
    
    if (running) {
      startCountdown();
    } else {
      stopCountdown();
    }
    renderTimer();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.timer && changes.timer.newValue) {
    console.log('[Timer Synced From Another Tab]', changes.timer.newValue);
    // Update local state from new timer value
    const newTimer = changes.timer.newValue;
    maxTimerValue = newTimer.duration || 300;
    running = !!newTimer.running;
    
    // Update startedAt from storage
    if (newTimer.startedAt) {
      startedAt = newTimer.startedAt;
    }
    
    // Calculate current remaining time based on actual elapsed time
    if (running && startedAt) {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      timerValue = Math.max(0, maxTimerValue - elapsed);
      
      // If timer has actually finished, update the state
      if (timerValue === 0) {
        running = false;
        // Update storage to reflect timer completion
        const updatedTimer = {
          ...newTimer,
          running: false,
          remaining: 0,
          now: Date.now()
        };
        chrome.storage.local.set({ timer: updatedTimer }, () => {
          if (chrome.runtime.lastError) {
            console.error('Storage error during timer completion on sync:', chrome.runtime.lastError);
          } else {
            console.log('[Timer Completed on Sync]', updatedTimer);
          }
        });
      }
    } else {
      // Timer is not running, use the stored remaining value
      if (typeof newTimer.remaining === 'number') {
        timerValue = newTimer.remaining;
      } else {
        timerValue = newTimer.duration || 300;
      }
    }
    
    if (interval) clearInterval(interval);
    if (running) {
      startCountdown();
    } else {
      stopCountdown();
    }
    renderTimer();
    // If input is present (editing), update its value too
    const input = pill.querySelector('input[type="text"]');
    if (input) {
      input.value = formatTime(timerValue);
    }
  }
  if (area === 'local' && changes.countdownEventName && changes.countdownEventName.newValue) {
    countdownEventName = changes.countdownEventName.newValue;
    console.log('[Synced Event Name From Another Tab]', countdownEventName);
    setupCountdownPill();
  }
  if (area === 'local' && changes.pillPosition && changes.pillPosition.newValue) {
    const newPosition = changes.pillPosition.newValue;
    if (pillContainer) {
      pillContainer.style.left = newPosition.left;
      pillContainer.style.top = newPosition.top;
      pillContainer.style.bottom = 'auto';
      console.log('[Pill Position Synced]', newPosition);
    }
  }
});

// Create pill container if not present
let pillContainer = document.getElementById('chrome-pill-container');
if (!pillContainer) {
  pillContainer = document.createElement('div');
  pillContainer.id = 'chrome-pill-container';
  pillContainer.className = 'pill-container';
  pillContainer.style.position = 'fixed';
  pillContainer.style.zIndex = '99999';
  pillContainer.style.display = 'flex';
  pillContainer.style.flexDirection = 'row';
  pillContainer.style.gap = '12px';
  pillContainer.style.alignItems = 'center';
  pillContainer.style.width = '';
  pillContainer.style.minWidth = '';
  pillContainer.style.maxWidth = '';
  pillContainer.style.cursor = 'move';
  document.body.appendChild(pillContainer);
}
  
  // Load saved position or use default
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('pillPosition', (result) => {
      if (result && result.pillPosition && result.pillPosition.left && result.pillPosition.top) {
        pillContainer.style.left = result.pillPosition.left;
        pillContainer.style.top = result.pillPosition.top;
        pillContainer.style.bottom = 'auto';
        console.log('[Pill Position Restored]', result.pillPosition);
      } else {
        pillContainer.style.left = '40px';
        pillContainer.style.top = '40px';
        pillContainer.style.bottom = 'auto';
        console.log('[Pill Position Defaulted]', { left: '40px', top: '40px' });
      }
    });
  } else {
    pillContainer.style.left = '40px';
    pillContainer.style.top = '40px';
    pillContainer.style.bottom = 'auto';
    console.log('[Pill Position Defaulted]', { left: '40px', top: '40px' });
  }
  
  // Add draggable functionality to the container
  let isDragging = false;
  let offsetX, offsetY;
  
  pillContainer.addEventListener('mousedown', function(e) {
    // Don't start dragging if clicking on interactive elements inside pills
    if (e.target.closest('input') || e.target.closest('button') || e.target.closest('img')) {
      return;
    }
    
    isDragging = true;
    const rect = pillContainer.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    pillContainer.style.transition = 'none'; // Disable transition while dragging
    pillContainer.style.cursor = 'grabbing';
    
    // Prevent text selection while dragging
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (isDragging) {
      // Calculate desired position
      const desiredLeft = e.clientX - offsetX;
      const desiredTop = e.clientY - offsetY;
      
      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Get element dimensions
      const elementRect = pillContainer.getBoundingClientRect();
      const elementWidth = elementRect.width;
      const elementHeight = elementRect.height;
      
      // Calculate boundaries
      const minLeft = 0;
      const maxLeft = viewportWidth - elementWidth;
      const minTop = 0;
      const maxTop = viewportHeight - elementHeight;
      
      // Clamp position within boundaries
      const clampedLeft = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
      const clampedTop = Math.max(minTop, Math.min(maxTop, desiredTop));
      
      // Apply clamped position
      pillContainer.style.left = clampedLeft + 'px';
      pillContainer.style.top = clampedTop + 'px';
      pillContainer.style.bottom = 'auto'; // Remove bottom positioning when dragging
    }
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      pillContainer.style.transition = 'all 0.3s ease'; // Restore transition
      pillContainer.style.cursor = 'move';
      
      // Ensure final position is within bounds
      const rect = pillContainer.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let left = parseInt(pillContainer.style.left);
      let top = parseInt(pillContainer.style.top);
      
      // Clamp final position
      left = Math.max(0, Math.min(viewportWidth - rect.width, left));
      top = Math.max(0, Math.min(viewportHeight - rect.height, top));
      
      pillContainer.style.left = left + 'px';
      pillContainer.style.top = top + 'px';
      
      // Save position to chrome.storage.local
      console.log('[Pill Position Saved]', { left: left + 'px', top: top + 'px' });
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ pillPosition: { left: left + 'px', top: top + 'px' } });
      }
    }
  });
  
  // Handle window resize to keep pill within bounds
  window.addEventListener('resize', function() {
    if (!isDragging) {
      const rect = pillContainer.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let left = parseInt(pillContainer.style.left) || 0;
      let top = parseInt(pillContainer.style.top) || 0;
      
      // Clamp position after resize
      left = Math.max(0, Math.min(viewportWidth - rect.width, left));
      top = Math.max(0, Math.min(viewportHeight - rect.height, top));
      
      pillContainer.style.left = left + 'px';
      pillContainer.style.top = top + 'px';
    }
  });

// Remove fixed positioning from pill and countdownPill, and append them to pillContainer
pill.style.position = '';
pill.style.left = '';
pill.style.bottom = '';
pill.style.zIndex = '';
if (!pillContainer.contains(pill)) pillContainer.appendChild(pill);

let countdownPill = document.getElementById('chrome-countdown-pill');
if (!countdownPill) {
  countdownPill = document.createElement('div');
  countdownPill.id = 'chrome-countdown-pill';
  countdownPill.style.background = '#000';
  countdownPill.style.borderRadius = '1000px';
  countdownPill.style.minWidth = '40px';
  countdownPill.style.display = 'flex';
  countdownPill.style.alignItems = 'center';
  countdownPill.style.justifyContent = 'center';
  countdownPill.style.boxShadow = '0 4px 24px 0 rgba(0,0,0,0.18)';
  countdownPill.style.padding = '7px 16px';
  countdownPill.style.color = '#fff';
  countdownPill.style.fontSize = '26px';
  countdownPill.style.fontFamily = "Poppins";
  countdownPill.style.fontWeight = '500';
  countdownPill.style.letterSpacing = '-0.5px';
  countdownPill.style.minHeight = '34px';
  countdownPill.style.cursor = 'default';
  countdownPill.style.flexShrink = '0';
  countdownPill.style.maxWidth = '120px';
  countdownPill.style.margin = '0';
  countdownPill.style.position = '';
  countdownPill.style.bottom = '';
  countdownPill.style.zIndex = '';
  // Content: event label (no wrap, no overflow hidden) + calendar icon + countdown text
  countdownPill.innerHTML = `
    <span class="countdown-event-label" style="color:#aaa;font-family:Poppins;font-weight:500;font-size:20px;letter-spacing:-0.5px;margin:0;align-items:center;white-space:nowrap;opacity:0;max-width:0;overflow:hidden;transition:opacity 0.84375s cubic-bezier(.68,-0.60,.27,1.65), margin 0.84375s cubic-bezier(.68,-0.60,.27,1.65), max-width 0.84375s cubic-bezier(.68,-0.60,.27,1.65); cursor:pointer;">${countdownEventName}</span>
    <svg class="countdown-icon" width="28px" height="28px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="#ff3d00" aria-hidden="true" data-slot="icon" style="display:flex;align-items:center;justify-content:center;margin-right:10px;">
      <path d="M5.75 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM7.25 8.25A.75.75 0 0 1 8 7.5h2.25a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75ZM5.75 9.5a.75.75 0 0 0 0 1.5H8a.75.75 0 0 0 0-1.5H5.75Z"/>
      <path fill-rule="evenodd" d="M4.75 1a.75.75 0 0 0-.75.75V3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2V1.75a.75.75 0 0 0-1.5 0V3h-5V1.75A.75.75 0 0 0 4.75 1ZM3.5 7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V7Z" clip-rule="evenodd"/>
    </svg>
    <span style="color:#fff;font-family:Poppins;font-weight:500;font-size:24px;letter-spacing:-0.5px;display:flex;align-items:center;">4d</span>
    <span class="countdown-details" style="color:#aaa;font-family:Poppins;font-weight:500;font-size:20px;letter-spacing:-0.5px;margin:0;align-items:center;white-space:nowrap;opacity:0;max-width:0;overflow:hidden;transition:opacity 0.84375s cubic-bezier(.68,-0.60,.27,1.65), margin 0.84375s cubic-bezier(.68,-0.60,.27,1.65), max-width 0.84375s cubic-bezier(.68,-0.60,.27,1.65); cursor:pointer;">06/15/2026</span>
  `;
  
  // Load saved date after creating the pill
  chrome.storage.local.get(['countdownTargetDate'], (result) => {
    if (result.countdownTargetDate) {
      console.log("[Loaded Target Date]", result.countdownTargetDate);
      const dateSpan = countdownPill.querySelector('.countdown-details');
      if (dateSpan) {
        dateSpan.textContent = result.countdownTargetDate;
      }
      
      // Calculate days remaining
      const targetDate = parseTargetDate(result.countdownTargetDate);
      if (targetDate) {
        const daysRemaining = calculateDaysRemaining(targetDate);
        const countdownText = countdownPill.querySelector('span[style*="color:#fff"]');
        if (countdownText) {
          countdownText.textContent = daysRemaining + 'd';
        }
        console.log("[Days Remaining]", daysRemaining);
      }
    }
  });
  
  // Helper function to parse target date
  function parseTargetDate(dateStr) {
    if (!/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) {
      return null;
    }
    const [month, day, year] = dateStr.split('/').map(num => parseInt(num, 10));
    const fullYear = 2000 + year;
    return new Date(fullYear, month - 1, day);
  }
  
  // Helper function to calculate days remaining
  function calculateDaysRemaining(targetDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day
    targetDate.setHours(0, 0, 0, 0); // Set to start of day
    
    const timeDiff = targetDate.getTime() - today.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    return Math.max(0, daysDiff); // Return 0 if date has passed
  }
  
  // Ensure pill is flex and horizontally aligned
  countdownPill.style.display = 'flex';
  countdownPill.style.alignItems = 'center';
  // Make the countdown pill fit its contents exactly
  countdownPill.style.width = '';
  countdownPill.style.minWidth = '';
  countdownPill.style.maxWidth = '';
  countdownPill.style.padding = '7px 16px';
  countdownPill.style.display = 'flex';
  countdownPill.style.alignItems = 'center';
  
  // Update hover event listeners to include the new details text
  countdownPill.addEventListener('mouseenter', () => {
    const eventLabel = countdownPill.querySelector('.countdown-event-label');
    const detailsLabel = countdownPill.querySelector('.countdown-details');
    eventLabel.style.opacity = '1';
    eventLabel.style.maxWidth = '1000px';
    eventLabel.style.margin = '0 12px 0 0';
    detailsLabel.style.opacity = '1';
    detailsLabel.style.maxWidth = '1000px';
    detailsLabel.style.margin = '0 0 0 12px';
  });

  countdownPill.addEventListener('mouseleave', () => {
    const eventLabel = countdownPill.querySelector('.countdown-event-label');
    const detailsLabel = countdownPill.querySelector('.countdown-details');
    eventLabel.style.opacity = '0';
    eventLabel.style.maxWidth = '0';
    eventLabel.style.margin = '0';
    detailsLabel.style.opacity = '0';
    detailsLabel.style.maxWidth = '0';
    detailsLabel.style.margin = '0';
  });

  if (!pillContainer.contains(countdownPill)) pillContainer.appendChild(countdownPill);
}

// Add event name click-to-edit functionality
function attachEventNameEditHandler(label) {
  label.style.pointerEvents = 'auto'; // Always allow pointer events
  label.addEventListener('click', function handler(e) {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = label.textContent;
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.color = '#aaa';
    input.style.fontSize = '26px';
    input.style.fontFamily = label.style.fontFamily ? label.style.fontFamily : "Poppins";
    input.style.fontWeight = label.style.fontWeight ? label.style.fontWeight : '500';
    input.style.letterSpacing = label.style.letterSpacing;
    input.style.textAlign = 'left';
    input.style.width = (label.offsetWidth + 20) + 'px';
    input.style.outline = 'none';
    input.style.boxShadow = 'none';
    input.style.margin = label.style.margin;
    input.style.opacity = '1';
    input.style.maxWidth = label.style.maxWidth;
    label.replaceWith(input);
    input.focus();
    input.select();
    function finishEdit() {
      const newLabel = document.createElement('span');
      newLabel.className = 'countdown-event-label';
      newLabel.textContent = input.value;
      newLabel.setAttribute('style', label.getAttribute('style'));
      newLabel.style.cursor = 'pointer';
      input.replaceWith(newLabel);
      chrome.storage.local.set({ countdownEventName: input.value }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage error saving event name:', chrome.runtime.lastError);
        } else {
          console.log('[Saved New Event Name]', input.value);
        }
      });
      attachEventNameEditHandler(newLabel);
    }
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') finishEdit();
      else if (e.key === 'Escape') finishEdit();
    });
    input.addEventListener('blur', finishEdit);
  });
}

const eventLabel = countdownPill.querySelector('.countdown-event-label');
attachEventNameEditHandler(eventLabel);

chrome.storage.local.get('countdownEventName', (result) => {
  if (result && result.countdownEventName) {
    countdownEventName = result.countdownEventName;
    console.log('[Loaded Event Name]', countdownEventName);
  }
  // After loading, set up the pill
  setupCountdownPill();
});

function setupCountdownPill() {
  let countdownPill = document.getElementById('chrome-countdown-pill');
  if (!countdownPill) {
    countdownPill = document.createElement('div');
    countdownPill.id = 'chrome-countdown-pill';
    pillContainer.appendChild(countdownPill);
  }
  countdownPill.style.background = '#000';
  countdownPill.style.borderRadius = '1000px';
  countdownPill.style.minWidth = '40px';
  countdownPill.style.display = 'flex';
  countdownPill.style.alignItems = 'center';
  countdownPill.style.justifyContent = 'center';
  countdownPill.style.boxShadow = '0 4px 24px 0 rgba(0,0,0,0.18)';
  countdownPill.style.padding = '7px 16px';
  countdownPill.style.color = '#fff';
  countdownPill.style.fontSize = '26px';
  countdownPill.style.fontFamily = "Poppins";
  countdownPill.style.fontWeight = '500';
  countdownPill.style.letterSpacing = '-0.5px';
  countdownPill.style.minHeight = '34px';
  countdownPill.style.cursor = 'default';
  countdownPill.style.flexShrink = '0';
  countdownPill.style.maxWidth = '120px';
  countdownPill.style.margin = '0';
  countdownPill.style.position = '';
  countdownPill.style.bottom = '';
  countdownPill.style.zIndex = '';
  countdownPill.innerHTML = `
    <span class="countdown-event-label" style="color:#aaa;font-family:Poppins;font-weight:500;font-size:20px;letter-spacing:-0.5px;margin:0;align-items:center;white-space:nowrap;opacity:0;max-width:0;overflow:hidden;transition:opacity 0.84375s cubic-bezier(.68,-0.60,.27,1.65), margin 0.84375s cubic-bezier(.68,-0.60,.27,1.65), max-width 0.84375s cubic-bezier(.68,-0.60,.27,1.65); cursor:pointer;">${countdownEventName}</span>
    <svg class="countdown-icon" width="28px" height="28px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="#ff3d00" aria-hidden="true" data-slot="icon" style="display:flex;align-items:center;justify-content:center;margin-right:10px;">
      <path d="M5.75 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM7.25 8.25A.75.75 0 0 1 8 7.5h2.25a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75ZM5.75 9.5a.75.75 0 0 0 0 1.5H8a.75.75 0 0 0 0-1.5H5.75Z"/>
      <path fill-rule="evenodd" d="M4.75 1a.75.75 0 0 0-.75.75V3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2V1.75a.75.75 0 0 0-1.5 0V3h-5V1.75A.75.75 0 0 0 4.75 1ZM3.5 7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V7Z" clip-rule="evenodd"/>
    </svg>
    <span style="color:#fff;font-family:Poppins;font-weight:500;font-size:24px;letter-spacing:-0.5px;display:flex;align-items:center;">4d</span>
    <span class="countdown-details" style="color:#aaa;font-family:Poppins;font-weight:500;font-size:20px;letter-spacing:-0.5px;margin:0;align-items:center;white-space:nowrap;opacity:0;max-width:0;overflow:hidden;transition:opacity 0.84375s cubic-bezier(.68,-0.60,.27,1.65), margin 0.84375s cubic-bezier(.68,-0.60,.27,1.65), max-width 0.84375s cubic-bezier(.68,-0.60,.27,1.65); cursor:pointer;">06/15/2024</span>
  `;
  
  // Load saved date after creating the pill
  chrome.storage.local.get(['countdownTargetDate'], (result) => {
    if (result.countdownTargetDate) {
      console.log("[Loaded Target Date]", result.countdownTargetDate);
      const dateSpan = countdownPill.querySelector('.countdown-details');
      if (dateSpan) {
        dateSpan.textContent = result.countdownTargetDate;
      }
      
      // Calculate days remaining
      const targetDate = parseTargetDate(result.countdownTargetDate);
      if (targetDate) {
        const daysRemaining = calculateDaysRemaining(targetDate);
        const countdownText = countdownPill.querySelector('span[style*="color:#fff"]');
        if (countdownText) {
          countdownText.textContent = daysRemaining + 'd';
        }
        console.log("[Days Remaining]", daysRemaining);
      }
    }
  });
  
  // Helper function to parse target date
  function parseTargetDate(dateStr) {
    if (!/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) {
      return null;
    }
    const [month, day, year] = dateStr.split('/').map(num => parseInt(num, 10));
    const fullYear = 2000 + year;
    return new Date(fullYear, month - 1, day);
  }
  
  // Helper function to calculate days remaining
  function calculateDaysRemaining(targetDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day
    targetDate.setHours(0, 0, 0, 0); // Set to start of day
    
    const timeDiff = targetDate.getTime() - today.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    return Math.max(0, daysDiff); // Return 0 if date has passed
  }
  
  // Ensure pill is flex and horizontally aligned
  countdownPill.style.display = 'flex';
  countdownPill.style.alignItems = 'center';
  // Make the countdown pill fit its contents exactly
  countdownPill.style.width = '';
  countdownPill.style.minWidth = '';
  countdownPill.style.maxWidth = '';
  countdownPill.style.padding = '7px 16px';
  countdownPill.style.display = 'flex';
  countdownPill.style.alignItems = 'center';

  // Update hover event listeners to include the new details text
  countdownPill.addEventListener('mouseenter', () => {
    const eventLabel = countdownPill.querySelector('.countdown-event-label');
    const detailsLabel = countdownPill.querySelector('.countdown-details');
    eventLabel.style.opacity = '1';
    eventLabel.style.maxWidth = '1000px';
    eventLabel.style.margin = '0 12px 0 0';
    detailsLabel.style.opacity = '1';
    detailsLabel.style.maxWidth = '1000px';
    detailsLabel.style.margin = '0 0 0 12px';
  });

  countdownPill.addEventListener('mouseleave', () => {
    const eventLabel = countdownPill.querySelector('.countdown-event-label');
    const detailsLabel = countdownPill.querySelector('.countdown-details');
    eventLabel.style.opacity = '0';
    eventLabel.style.maxWidth = '0';
    eventLabel.style.margin = '0';
    detailsLabel.style.opacity = '0';
    detailsLabel.style.maxWidth = '0';
    detailsLabel.style.margin = '0';
  });

  // Add event name click-to-edit functionality
  const eventLabel = countdownPill.querySelector('.countdown-event-label');
  attachEventNameEditHandler(eventLabel);

  // Add date click-to-edit functionality
  function formatDateInput(str) {
    // Remove any non-digits
    const digits = str.replace(/\D/g, '');
    if (digits.length === 0) return '';
    
    // Format as MM/DD/YY
    if (digits.length <= 2) {
      return digits;
    } else if (digits.length <= 4) {
      return `${digits.slice(0,2)}/${digits.slice(2)}`;
    } else {
      return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4,6)}`;
    }
  }

  function isValidDate(dateStr) {
    // Check format MM/DD/YY
    if (!/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) {
      return false;
    }

    const [month, day, year] = dateStr.split('/').map(num => parseInt(num, 10));
    
    // Convert 2-digit year to full year (assuming 20xx)
    const fullYear = 2000 + year;
    
    // Create date object and verify parts match (handles invalid dates like 02/31/24)
    const date = new Date(fullYear, month - 1, day);
    return date.getMonth() === month - 1 && 
           date.getDate() === day && 
           date.getFullYear() === fullYear;
  }

  function attachDateEditHandler(span) {
    span.style.cursor = 'pointer';
    span.addEventListener('click', function handler(e) {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = span.textContent;
      input.style.background = 'transparent';
      input.style.border = 'none';
      input.style.color = '#aaa';
      input.style.fontSize = '26px';
      input.style.fontFamily = span.style.fontFamily ? span.style.fontFamily : "Poppins";
      input.style.fontWeight = span.style.fontWeight ? span.style.fontWeight : '500';
      input.style.letterSpacing = span.style.letterSpacing;
      input.style.textAlign = 'left';
      input.style.width = (span.offsetWidth + 20) + 'px';
      input.style.outline = 'none';
      input.style.boxShadow = 'none';
      input.style.margin = span.style.margin;
      input.style.opacity = '1';
      input.style.maxWidth = span.style.maxWidth;
      span.replaceWith(input);
      input.focus();
      input.select();

      // Add input formatting while typing
      input.addEventListener('input', () => {
        const cursorPos = input.selectionStart;
        const oldLength = input.value.length;
        input.value = formatDateInput(input.value);
        const newLength = input.value.length;
        // Adjust cursor position if we added slashes
        if (newLength > oldLength) {
          input.setSelectionRange(cursorPos + 1, cursorPos + 1);
        }
      });

      function finishEdit() {
        const formattedDate = formatDateInput(input.value);
        
        // Validate the date
        if (!isValidDate(formattedDate)) {
          // If invalid, shake the input and don't save
          input.style.transition = 'transform 0.1s ease-in-out';
          input.style.transform = 'translateX(5px)';
          setTimeout(() => {
            input.style.transform = 'translateX(-5px)';
            setTimeout(() => {
              input.style.transform = 'translateX(0)';
            }, 100);
          }, 100);
          return;
        }

        // Save the date to chrome.storage.local
        chrome.storage.local.set({ countdownTargetDate: formattedDate }, () => {
          console.log("[Saved Target Date]", formattedDate);
        });

        const newDate = document.createElement('span');
        newDate.className = 'countdown-details';
        newDate.textContent = formattedDate;
        newDate.style.cssText = `
          color:#aaa;
          font-family:Poppins;
          font-weight:500;
          font-size:20px;
          letter-spacing:-0.5px;
          margin:0;
          align-items:center;
          white-space:nowrap;
          opacity:0;
          max-width:0;
          overflow:hidden;
          transition:opacity 0.84375s cubic-bezier(.68,-0.60,.27,1.65), margin 0.84375s cubic-bezier(.68,-0.60,.27,1.65), max-width 0.84375s cubic-bezier(.68,-0.60,.27,1.65);
          cursor:pointer;
        `;
        input.replaceWith(newDate);
        
        // If the pill is currently being hovered, keep the date visible
        if (countdownPill.matches(':hover')) {
          newDate.style.opacity = '1';
          newDate.style.maxWidth = '1000px';
          newDate.style.margin = '0 0 0 12px';
        }
        
        attachDateEditHandler(newDate);
      }

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') finishEdit();
        else if (e.key === 'Escape') finishEdit();
      });
      input.addEventListener('blur', finishEdit);
    });
  }

  const dateText = countdownPill.querySelector('.countdown-details');
  attachDateEditHandler(dateText);
}

// Add initial date loading when the component is created
document.addEventListener('DOMContentLoaded', () => {
  // Load the saved date
  chrome.storage.local.get(['countdownTargetDate'], (result) => {
    if (result.countdownTargetDate) {
      console.log("[Loaded Target Date]", result.countdownTargetDate);
      // Find the countdown pill and get the date element specifically
      const countdownPill = document.querySelector('.countdown-pill');
      if (countdownPill) {
        const dateElements = countdownPill.querySelectorAll('.countdown-details');
        if (dateElements.length >= 2) {
          // The date is the second countdown-details element
          dateElements[1].textContent = result.countdownTargetDate;
        }
      }
    }
  });
});

// Listen for storage changes to update the date across tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.countdownTargetDate) {
    const newDate = changes.countdownTargetDate.newValue;
    console.log("[Target Date Updated]", newDate);
    // Find the actual countdown pill being used
    const countdownPill = document.getElementById('chrome-countdown-pill');
    if (countdownPill) {
      const dateSpan = countdownPill.querySelector('.countdown-details');
      if (dateSpan) {
        dateSpan.textContent = newDate;
      }
      
      // Recalculate days remaining
      const targetDate = parseTargetDate(newDate);
      if (targetDate) {
        const daysRemaining = calculateDaysRemaining(targetDate);
        const countdownText = countdownPill.querySelector('span[style*="color:#fff"]');
        if (countdownText) {
          countdownText.textContent = daysRemaining + 'd';
        }
        console.log("[Days Remaining]", daysRemaining);
      }
    }
  }
});

// Helper function to parse target date (for storage listener)
function parseTargetDate(dateStr) {
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) {
    return null;
  }
  const [month, day, year] = dateStr.split('/').map(num => parseInt(num, 10));
  const fullYear = 2000 + year;
  return new Date(fullYear, month - 1, day);
}

// Helper function to calculate days remaining (for storage listener)
function calculateDaysRemaining(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day
  targetDate.setHours(0, 0, 0, 0); // Set to start of day
  
  const timeDiff = targetDate.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  return Math.max(0, daysDiff); // Return 0 if date has passed
}

function createCountdownPill() {
  const pill = document.createElement('div');
  pill.className = 'countdown-pill';
  pill.style.cssText = `
    position:fixed;
    top:20px;
    right:20px;
    background:rgba(0,0,0,0.8);
    border-radius:1000px;
    padding:12px 16px;
    display:flex;
    align-items:center;
    gap:8px;
    z-index:9999;
    backdrop-filter:blur(10px);
    border:1px solid rgba(255,255,255,0.1);
    transition:all 0.3s ease;
    cursor:pointer;
  `;

  const eventName = document.createElement('span');
  eventName.className = 'countdown-details';
  eventName.textContent = 'Event Name';
  eventName.style.cssText = `
    color:#aaa;
    font-family:Poppins;
    font-weight:500;
    font-size:20px;
    letter-spacing:-0.5px;
    margin:0;
    align-items:center;
    white-space:nowrap;
    opacity:0;
    max-width:0;
    overflow:hidden;
    transition:opacity 0.84375s cubic-bezier(.68,-0.60,.27,1.65), margin 0.84375s cubic-bezier(.68,-0.60,.27,1.65), max-width 0.84375s cubic-bezier(.68,-0.60,.27,1.65);
    cursor:pointer;
  `;

  const countdownText = document.createElement('span');
  countdownText.className = 'countdown-text';
  countdownText.textContent = '4d';
  countdownText.style.cssText = `
    color:#fff;
    font-family:Poppins;
    font-weight:500;
    font-size:24px;
    letter-spacing:-0.5px;
    margin:0;
    white-space:nowrap;
  `;

  const dateText = document.createElement('span');
  dateText.className = 'countdown-details';
  dateText.textContent = '01/15/24';
  dateText.style.cssText = `
    color:#aaa;
    font-family:Poppins;
    font-weight:500;
    font-size:20px;
    letter-spacing:-0.5px;
    margin:0;
    align-items:center;
    white-space:nowrap;
    opacity:0;
    max-width:0;
    overflow:hidden;
    transition:opacity 0.84375s cubic-bezier(.68,-0.60,.27,1.65), margin 0.84375s cubic-bezier(.68,-0.60,.27,1.65), max-width 0.84375s cubic-bezier(.68,-0.60,.27,1.65);
    cursor:pointer;
  `;

  // Load saved date on component creation
  chrome.storage.local.get(['countdownTargetDate'], (result) => {
    if (result.countdownTargetDate) {
      console.log("[Loaded Target Date]", result.countdownTargetDate);
      dateText.textContent = result.countdownTargetDate;
    }
  });

  pill.appendChild(eventName);
  pill.appendChild(countdownText);
  pill.appendChild(dateText);

  // Load saved event name
  chrome.storage.local.get(['countdownEventName'], (result) => {
    if (result.countdownEventName) {
      console.log("[Loaded Event Name]", result.countdownEventName);
      eventName.textContent = result.countdownEventName;
    }
  });

  attachEventNameEditHandler(eventName);
  attachDateEditHandler(dateText);

  return pill;
}

// Add this CSS to the page for the pulse animation
if (!document.getElementById('pill-pulse-style')) {
  const style = document.createElement('style');
  style.id = 'pill-pulse-style';
  style.textContent = `
    .pill-pulse {
      animation: pillPulse 1.2s infinite alternate cubic-bezier(.68,-0.60,.27,1.65);
    }
    @keyframes pillPulse {
      0% { background:rgb(226, 53, 0); }
      100% { background:rgb(255, 77, 0); }
    }
  `;
  document.head.appendChild(style);
}

// On load, hide countdown pill if hideCountdown is true
if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get('hideCountdown', (result) => {
    if (result.hideCountdown) {
      const countdownPill = document.getElementById('chrome-countdown-pill');
      if (countdownPill) countdownPill.style.display = 'none';
    }
  });
  
  // On load, hide timer pill if timerOff is true
  chrome.storage.local.get('timerOff', (result) => {
    if (result.timerOff) {
      const timerPill = document.getElementById('chrome-timer-pill');
      if (timerPill) timerPill.style.display = 'none';
    }
  });
}

timerContainer.style.minWidth = '95px'; 