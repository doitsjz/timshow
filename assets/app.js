/* 极简计时器 · 静态前端逻辑
 * 纯原生 JS，无依赖
 * 包含：TimerEngine（秒表+倒计时）、SoundEngine（合成铃声）、Settings（持久化）、页面初始化
 */
(function () {
  'use strict';

  // ---------- 工具 ----------
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function pad(n, len) { var s = String(n); while (s.length < (len || 2)) s = '0' + s; return s; }

  // 通用图标 + 标签切换：兼容 lucide 已把 <i> 替换为 <svg> 的情况
  function swapIcon(btn, iconName, labelText) {
    if (!btn) return;
    var label = btn.querySelector('span');
    if (label && labelText) label.textContent = labelText;
    var oldIcon = btn.querySelector('i, svg');
    var newIcon = document.createElement('i');
    newIcon.setAttribute('data-lucide', iconName);
    newIcon.className = 'w-4 h-4';
    if (oldIcon) oldIcon.replaceWith(newIcon);
    else btn.insertBefore(newIcon, btn.firstChild);
    if (window.lucide) lucide.createIcons();
  }

  // 格式化毫秒为 MM:SS.mmm
  function formatElapsed(ms) {
    if (ms < 0) ms = 0;
    var total = Math.floor(ms);
    var m = Math.floor(total / 60000);
    var s = Math.floor((total % 60000) / 1000);
    var mm = total % 1000;
    return { main: pad(m) + ':' + pad(s), ms: '.' + pad(mm, 3) };
  }

  // ---------- Settings 持久化 ----------
  var Settings = {
    key: 'timer-settings',
    defaults: { sound: 'bell', volume: 70, customDuration: 25, customSeconds: 15, lastUnit: 'sec', customSoundUrl: '' },
    data: null,
    load: function () {
      try {
        var raw = localStorage.getItem(this.key);
        this.data = raw ? JSON.parse(raw) : Object.assign({}, this.defaults);
      } catch (e) { this.data = Object.assign({}, this.defaults); }
      // 合并缺失字段
      Object.keys(this.defaults).forEach(function (k) {
        if (this.data[k] === undefined) this.data[k] = this.defaults[k];
      }, this);
      return this.data;
    },
    save: function () {
      try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {}
    },
    get: function (k) { return this.data[k]; },
    set: function (k, v) { this.data[k] = v; this.save(); }
  };

  // ---------- SoundEngine 合成铃声 ----------
  var SoundEngine = {
    ctx: null,
    master: null,
    audioEl: null, // 自定义音频
    ensure: function () {
      if (this.ctx) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    setVolume: function (v) {
      // v: 0-100
      if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v / 100));
    },
    // 合成单音
    beep: function (freq, duration, type, gainPeak) {
      if (!this.ctx) return;
      var now = this.ctx.currentTime;
      var osc = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      // ADSR 简化包络
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gainPeak || 0.3, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(g); g.connect(this.master);
      osc.start(now); osc.stop(now + duration);
    },
    // 铃声：正弦波衰减
    bell: function () {
      if (!this.ctx) return;
      var now = this.ctx.currentTime;
      // 持续 3 秒：三个谐波循环 2 次（每次 1.5s）
      [880, 1320, 1760].forEach(function (f, i) {
        var osc = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.25, now + 0.005 + i * 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
        osc.connect(g); g.connect(this.master);
        osc.start(now + i * 0.02); osc.stop(now + 3.2);
      }, this);
    },
    // 叮咚：双音 高→低，每 0.75s 一组，重复 4 次凑够 3 秒
    dingdong: function () {
      if (!this.ctx) return;
      var self = this;
      var stepMs = 750;
      var repeat = 4;
      for (var k = 0; k < repeat; k++) {
        (function (delay) {
          setTimeout(function () {
            self.beep(988, 0.25, 'sine', 0.3); // B5
            setTimeout(function () { self.beep(659, 0.5, 'sine', 0.3); }, 220); // E5
          }, delay);
        })(k * stepMs);
      }
    },
    // 蜂鸣：方波持续 3 秒
    buzzer: function () {
      if (!this.ctx) return;
      var now = this.ctx.currentTime;
      var osc = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.2, now + 0.01);
      g.gain.setValueAtTime(0.2, now + 2.8);
      g.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
      osc.connect(g); g.connect(this.master);
      osc.start(now); osc.stop(now + 3.0);
    },
    play: function (type, isPreview) {
      this.ensure();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      switch (type) {
        case 'bell': this.bell(); break;
        case 'dingdong': this.dingdong(); break;
        case 'buzzer': this.buzzer(); break;
        case 'silent': break; // 静音：仅闪烁
        case 'custom':
          this.playCustom(isPreview);
          break;
      }
    },
    playCustom: function (isPreview) {
      var url = Settings.get('customSoundUrl');
      if (!url) return;
      if (!this.audioEl) {
        this.audioEl = new Audio();
        this.audioEl.onerror = function () {};
      }
      this.audioEl.src = url;
      this.audioEl.currentTime = 0;
      this.audioEl.volume = isPreview ? 0.7 : 1;
      var p = this.audioEl.play();
      if (p && p.catch) p.catch(function () {});
    },
    // 屏幕闪烁（静音/到点视觉提示）
    flashScreen: function () {
      var el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;border:4px solid #F87171;animation:tm-flash 0.6s ease-in-out 3';
      var st = document.createElement('style');
      st.textContent = '@keyframes tm-flash{0%,100%{opacity:0}50%{opacity:0.85}}';
      document.head.appendChild(st);
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); st.remove(); }, 2000);
    }
  };

  // ---------- TimerEngine 计时内核 ----------
  function TimerEngine(opts) {
    this.mode = opts.mode || 'stopwatch'; // stopwatch | countdown
    this.onTick = opts.onTick || function () {};
    this.onFinish = opts.onFinish || function () {};
    this.targetMs = opts.targetMs || 0; // 倒计时目标
    this.state = 'idle'; // idle | running | paused
    this.rafId = null;
    this.startOffset = 0; // performance.now() - accumulatedMs
    this.accumulatedMs = 0;
    this.laps = [];
  }
  TimerEngine.prototype.start = function () {
    if (this.state === 'running') return;
    this.state = 'running';
    this.startOffset = performance.now() - this.accumulatedMs;
    var self = this;
    function loop() {
      if (self.state !== 'running') return;
      var elapsed = performance.now() - self.startOffset;
      self.onTick(elapsed);
      if (self.mode === 'countdown') {
        var remaining = self.targetMs - elapsed;
        if (remaining <= 0) {
          self.accumulatedMs = self.targetMs;
          self.state = 'idle';
          self.onTick(self.targetMs);
          self.onFinish();
          return;
        }
      }
      self.rafId = requestAnimationFrame(loop);
    }
    this.rafId = requestAnimationFrame(loop);
  };
  TimerEngine.prototype.pause = function () {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.accumulatedMs = performance.now() - this.startOffset;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  };
  TimerEngine.prototype.reset = function () {
    this.state = 'idle';
    this.accumulatedMs = 0;
    this.laps = [];
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.onTick(0);
  };
  TimerEngine.prototype.lap = function () {
    var elapsed = this.state === 'running' ? performance.now() - this.startOffset : this.accumulatedMs;
    var prev = this.laps.length ? this.laps[this.laps.length - 1].total : 0;
    this.laps.push({ total: elapsed, diff: elapsed - prev });
    return this.laps[this.laps.length - 1];
  };
  TimerEngine.prototype.setTarget = function (minutes) {
    this.targetMs = minutes * 60000;
    this.reset();
  };
  // 后台恢复校正：标签页可见时重算
  TimerEngine.prototype.resync = function () {
    if (this.state !== 'running') return;
    // startOffset 不变，elapsed 自动按 now 重算，rAF 会继续
  };

  // ---------- 页面可见性兜底 ----------
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && window.__timer) window.__timer.resync();
  });

  // ---------- 秒表页面初始化 ----------
  function initStopwatch() {
    var engine = new TimerEngine({ mode: 'stopwatch' });
    window.__timer = engine;
    var mainEl = $('.display__main');
    var msEl = $('.display__ms');
    var progressFill = $('.progress__fill');

    // 模拟时钟指针
    var handSec = $('#hand-sec');
    var handMin = $('#hand-min');
    var clockTicks = $('#clock-ticks');
    var clockMain = $('#clock-main');
    var clockMs = $('#clock-ms');
    var ringFg = $('#ring-fg');
    var RING_CIRC = 2 * Math.PI * 140; // r=140
    // 生成 60 刻度（独立 .num 元素，counter-rotate 保持直立）
    if (clockTicks && !clockTicks.children.length) {
      for (var i = 0; i < 60; i++) {
        var s = document.createElement('span');
        s.style.transform = 'translateX(-50%) rotate(' + (i * 6) + 'deg)';
        s.style.transformOrigin = '50% 134px';
        if (i % 5 === 0) {
          s.className = 'major';
          var n = document.createElement('span');
          n.className = 'clock__num';
          n.textContent = i === 0 ? '60' : String(i);
          var rad = (i * 6 - 90) * Math.PI / 180;
          var nx = 140 + Math.cos(rad) * 110;
          var ny = 140 + Math.sin(rad) * 110;
          n.style.left = nx + 'px';
          n.style.top = ny + 'px';
          n.style.transform = 'translate(-50%,-50%)';
          clockTicks.appendChild(n);
        }
        clockTicks.appendChild(s);
      }
    }

    var btnStart = $('[data-dom-id="btn-start"]');
    var btnReset = $('[data-dom-id="btn-reset"]');

    engine.onTick = function (elapsed) {
      var f = formatElapsed(elapsed);
      if (mainEl) mainEl.textContent = f.main;
      if (msEl) msEl.textContent = f.ms;
      // 时钟中心数字同步
      if (clockMain) clockMain.textContent = f.main;
      if (clockMs) clockMs.textContent = f.ms;
      // 模拟时钟：秒针 = 秒数 * 6°，分针 = 分钟数 * 6° + 秒数 * 0.1°
      if (handSec || handMin) {
        var totalSec = elapsed / 1000;
        var sec = totalSec % 60;
        var min = Math.floor(totalSec / 60) % 60;
        if (handSec) handSec.style.transform = 'translate(-50%,0) rotate(' + (sec * 6) + 'deg)';
        if (handMin) handMin.style.transform = 'translate(-50%,0) rotate(' + (min * 6 + sec * 0.1) + 'deg)';
      }
      // 进度环：60 秒一圈循环（跟秒针同步）
      if (ringFg) {
        var secPct = (elapsed % 60000) / 60000;
        ringFg.setAttribute('stroke-dasharray', RING_CIRC);
        ringFg.setAttribute('stroke-dashoffset', String(RING_CIRC * secPct));
      }
      // 兼容：若仍存在进度条（旧页面），按 60 秒循环
      if (progressFill) {
        var pct = (elapsed % 60000) / 60000 * 100;
        progressFill.style.width = pct + '%';
      }
    };

    function setStartButton(running) {
      if (running) swapIcon(btnStart, 'pause', '暂停');
      else swapIcon(btnStart, 'play', '开始');
    }

    if (btnStart) btnStart.addEventListener('click', function () {
      // 移动端 iOS Safari 必须在用户手势内解锁 AudioContext，否则归零铃声会被拦截
      try { SoundEngine.ensure(); if (SoundEngine.ctx && SoundEngine.ctx.state === 'suspended') SoundEngine.ctx.resume(); } catch (e) {}
      if (engine.state === 'running') { engine.pause(); setStartButton(false); }
      else { engine.start(); setStartButton(true); }
    });
    if (btnReset) btnReset.addEventListener('click', function () {
      engine.reset(); setStartButton(false);
    });

    // 初始化
    engine.onTick(0);
  }

  // ---------- 倒计时页面初始化 ----------
  function initCountdown() {
    Settings.load();
    var duration = Settings.get('customDuration') || 25;
    var lastUnit = Settings.get('lastUnit') || 'sec';
    var lastSeconds = Settings.get('customSeconds') || 15;
    var engine = new TimerEngine({ mode: 'countdown', targetMs: duration * 60000 });
    window.__timer = engine;

    var mainEl = $('.display__main');
    var msEl = $('.display__ms');
    var progressFill = $('.progress__fill');
    var targetLabel = $('.display-block .text-\\[11px\\].text-muted-foreground:last-child');
    var customInput = $('[data-dom-id="custom-duration"]');

    var btnStart = $('[data-dom-id="btn-start"]');
    var btnReset = $('[data-dom-id="btn-reset"]');
    var btnSound = $('[data-dom-id="btn-sound"]');

    engine.onTick = function (elapsed) {
      var remaining = engine.targetMs - elapsed;
      if (remaining < 0) remaining = 0;
      var f = formatElapsed(remaining);
      if (mainEl) mainEl.textContent = f.main;
      if (msEl) msEl.textContent = f.ms;
      var pct = engine.targetMs > 0 ? ((1 - elapsed / engine.targetMs) * 100) : 0;
      if (pct < 0) pct = 0;
      if (progressFill) progressFill.style.width = pct + '%';
    };
    engine.onFinish = function () {
      var soundType = Settings.get('sound');
      SoundEngine.setVolume(Settings.get('volume'));
      SoundEngine.play(soundType);
      if (soundType === 'silent') SoundEngine.flashScreen();
      else { setTimeout(function(){ SoundEngine.flashScreen(); }, 100); }
      setStartButton(false);
    };

    function setStartButton(running) {
      if (running) swapIcon(btnStart, 'pause', '暂停');
      else swapIcon(btnStart, 'play', '开始');
    }

    var targetLabel = $('#target-label');
    // 当前单位与值（用于互斥与持久化恢复）
    var currentUnit = 'min'; // 'min' | 'sec'
    var currentVal = duration;

    function updatePresetActive(unit, val) {
      $$('.preset').forEach(function (p) {
        var pUnit = p.getAttribute('data-unit') || 'min';
        var isCustom = p.getAttribute('data-dom-id') === 'preset-custom';
        var pVal;
        if (isCustom) {
          var ci = p.querySelector('input');
          pVal = ci ? parseInt(ci.value, 10) : NaN;
        } else {
          pVal = parseInt(p.querySelector('.font-mono').textContent, 10);
        }
        // 自定义档：仅当当前选中值不在 15/30 时才激活
        var isActive;
        if (isCustom) {
          isActive = (pUnit === unit && pVal === val && val !== 15 && val !== 30);
        } else {
          isActive = (pUnit === unit && pVal === val);
        }
        p.classList.toggle('preset--active', isActive);
        p.classList.toggle('border-primary', isActive);
        p.classList.toggle('bg-primary/10', isActive);
        // 主数字着色
        var num = p.querySelector('.font-mono');
        if (num) num.classList.toggle('text-primary', isActive);
        num.classList.toggle('text-foreground', !isActive);
        // 副标签着色
        var sub = p.querySelectorAll('span')[1];
        if (sub) {
          sub.classList.toggle('text-primary/80', isActive);
          sub.classList.toggle('text-muted-foreground', !isActive);
        }
      });
    }

    function updateTargetLabel(unit, val) {
      if (!targetLabel) return;
      if (unit === 'min') {
        var tag = val === 25 ? '番茄钟默认' : (val === 5 ? '短休默认' : '分钟档');
        targetLabel.textContent = '目标 ' + val + ' 分钟 · ' + tag;
      } else {
        targetLabel.textContent = '目标 ' + val + ' 秒 · 秒级训练';
      }
    }

    function setCustomInputEnabled(enabled) {
      if (!customInput) return;
      customInput.disabled = !enabled;
      var wrap = $('#custom-duration-wrap');
      if (wrap) wrap.style.opacity = enabled ? '1' : '0.4';
    }

    function setDuration(minutes) {
      minutes = Math.max(1, Math.min(999, parseInt(minutes, 10) || 25));
      currentUnit = 'min'; currentVal = minutes;
      engine.setTarget(minutes); // minutes → ms
      Settings.set('customDuration', minutes);
      Settings.set('lastUnit', 'min');
      if (customInput) customInput.value = minutes;
      setStartButton(false);
      updatePresetActive('min', minutes);
      updateTargetLabel('min', minutes);
      setCustomInputEnabled(true);
    }

    function setDurationSeconds(seconds, syncInput) {
      var raw = parseInt(seconds, 10);
      seconds = Math.max(1, Math.min(600, raw || 30));
      currentUnit = 'sec'; currentVal = seconds;
      engine.targetMs = seconds * 1000;
      engine.reset();
      Settings.set('customSeconds', seconds);
      Settings.set('lastUnit', 'sec');
      if (customInput) customInput.value = '';
      // 同步回自定义秒数输入框，避免显示值与引擎 targetMs 不一致
      if (syncInput && customSecondsInput && customSecondsInput.value !== String(seconds)) {
        customSecondsInput.value = seconds;
      }
      setStartButton(false);
      updatePresetActive('sec', seconds);
      updateTargetLabel('sec', seconds);
      setCustomInputEnabled(false);
    }

    // 预设按钮：按 data-unit 分流
    var customSecondsInput = $('[data-dom-id="custom-seconds"]');
    $$('.preset').forEach(function (p) {
      p.addEventListener('click', function (e) {
        // 点击自定义容器内的 input 时不触发跳转，让用户输入
        if (e.target && e.target.tagName === 'INPUT') return;
        var unit = p.getAttribute('data-unit') || 'min';
        var isCustom = p.getAttribute('data-dom-id') === 'preset-custom';
        if (isCustom) {
          var csv = customSecondsInput ? customSecondsInput.value : 120;
          // 点击自定义档时同步回写夹紧值，保证输入框显示与引擎一致
          setDurationSeconds(csv, true);
          return;
        }
        var val = parseInt(p.querySelector('.font-mono').textContent, 10);
        if (unit === 'sec') setDurationSeconds(val);
        else setDuration(val);
      });
    });
    if (customSecondsInput) {
      customSecondsInput.addEventListener('input', function () {
        var v = parseInt(customSecondsInput.value, 10);
        if (isNaN(v)) return;
        // 越界立刻夹紧并回写输入框，确保显示值与引擎 targetMs 始终一致
        if (v < 1) v = 1;
        if (v > 600) {
          v = 600;
          customSecondsInput.value = 600;
        }
        setDurationSeconds(v);
        updatePresetActive('sec', v);
        updateTargetLabel('sec', v);
        Settings.set('customSeconds', v);
      });
      customSecondsInput.addEventListener('change', function () {
        // 失焦兜底：空值/非法值回退到 30
        var v = parseInt(customSecondsInput.value, 10);
        if (isNaN(v) || v < 1) v = 30;
        if (v > 600) v = 600;
        setDurationSeconds(v, true);
      });
      customSecondsInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { customSecondsInput.blur(); } });
    }
    if (customInput) {
      customInput.addEventListener('change', function () { setDuration(customInput.value); });
      customInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { setDuration(customInput.value); customInput.blur(); } });
    }

    if (btnStart) btnStart.addEventListener('click', function () {
      // 移动端 iOS Safari 必须在用户手势内解锁 AudioContext，否则归零铃声会被拦截
      try { SoundEngine.ensure(); if (SoundEngine.ctx && SoundEngine.ctx.state === 'suspended') SoundEngine.ctx.resume(); } catch (e) {}
      if (engine.state === 'running') { engine.pause(); setStartButton(false); }
      else { engine.start(); setStartButton(true); }
    });
    if (btnReset) btnReset.addEventListener('click', function () {
      engine.reset(); setStartButton(false);
    });

    // 初始化：按上次记忆的单位档恢复
    if (lastUnit === 'sec') {
      if (customInput) customInput.value = '';
      // 仅当上次选中的是自定义值（非 15/30/60）时，才覆盖输入框；否则保留 HTML 默认 120
      if (customSecondsInput && lastSeconds !== 15 && lastSeconds !== 30 && lastSeconds !== 60) {
        customSecondsInput.value = lastSeconds;
      }
      setDurationSeconds(lastSeconds);
    } else {
      if (customInput) customInput.value = duration;
      setDuration(duration);
    }
  }

  // ---------- 设置页面初始化 ----------
  function initSettings() {
    Settings.load();
    var currentSound = Settings.get('sound');
    var currentVolume = Settings.get('volume');

    var options = $$('.sound-option');
    var volumeFill = $('.volume-row__fill');
    var volumeThumb = $('.volume-row__thumb');
    var volumeText = $('.volume-row').querySelector('.font-mono');
    var doneBtn = $('[data-dom-id="btn-sound-done"]');
    var closeBtn = $('[data-dom-id="btn-sound-close"]');
    var resetBtn = $('[data-dom-id="btn-sound-reset"]');
    var customUpload = null;

    function selectOption(type) {
      options.forEach(function (opt) { opt.classList.remove('sound-option--active'); });
      var target = options.find(function (opt) {
        var label = opt.querySelector('.text-\\[14px\\].font-medium');
        return label && label.textContent.trim() === labelFor(type);
      });
      if (target) target.classList.add('sound-option--active');
      currentSound = type;
      Settings.set('sound', type);
    }

    function labelFor(type) {
      return { bell: '铃声', dingdong: '叮咚', buzzer: '蜂鸣', silent: '静音', custom: '自定义' }[type] || type;
    }
    function typeForLabel(label) {
      var map = { '铃声': 'bell', '叮咚': 'dingdong', '蜂鸣': 'buzzer', '静音': 'silent', '自定义': 'custom' };
      return map[label.trim()] || 'bell';
    }

    function setVolume(v) {
      v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
      currentVolume = v;
      Settings.set('volume', v);
      if (volumeFill) volumeFill.style.width = v + '%';
      if (volumeThumb) volumeThumb.style.left = v + '%';
      if (volumeText) volumeText.textContent = v;
      SoundEngine.setVolume(v);
    }

    options.forEach(function (opt, idx) {
      opt.addEventListener('click', function (e) {
        if (e.target.closest('.sound-option__preview')) return; // 试听按钮单独处理
        var label = opt.querySelector('.text-\\[14px\\].font-medium').textContent;
        var type = typeForLabel(label);
        selectOption(type);
      });
      var preview = opt.querySelector('.sound-option__preview');
      if (preview) preview.addEventListener('click', function (e) {
        e.stopPropagation();
        var label = opt.querySelector('.text-\\[14px\\].font-medium').textContent;
        var type = typeForLabel(label);
        SoundEngine.setVolume(currentVolume);
        if (type === 'custom') {
          // 自定义试听：若未上传则触发上传
          if (!Settings.get('customSoundUrl')) {
            triggerUpload();
            return;
          }
        }
        SoundEngine.play(type, true);
      });
    });

    // 自定义上传
    function triggerUpload() {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = function () {
        var file = input.files[0];
        if (!file) return;
        var url = URL.createObjectURL(file);
        Settings.set('customSoundUrl', url);
        selectOption('custom');
      };
      input.click();
    }
    // 自定义选项的上传按钮（upload 图标）也触发
    var customOpt = options.find(function (o) {
      var l = o.querySelector('.text-\\[14px\\].font-medium');
      return l && l.textContent.trim() === '自定义';
    });
    if (customOpt) {
      var upBtn = customOpt.querySelector('[data-lucide="upload"]') || customOpt.querySelector('.sound-option__preview');
      if (upBtn && upBtn.parentElement) {
        upBtn.parentElement.addEventListener('click', function (e) { e.stopPropagation(); triggerUpload(); });
      }
    }

    // 音量滑条拖动
    var slider = $('.volume-row__slider');
    if (slider) {
      var dragging = false;
      function updateFromX(clientX) {
        var rect = slider.getBoundingClientRect();
        var pct = (clientX - rect.left) / rect.width * 100;
        setVolume(pct);
      }
      slider.addEventListener('mousedown', function (e) { dragging = true; updateFromX(e.clientX); });
      window.addEventListener('mousemove', function (e) { if (dragging) updateFromX(e.clientX); });
      window.addEventListener('mouseup', function () { dragging = false; });
      slider.addEventListener('touchstart', function (e) { dragging = true; updateFromX(e.touches[0].clientX); });
      window.addEventListener('touchmove', function (e) { if (dragging) updateFromX(e.touches[0].clientX); });
      window.addEventListener('touchend', function () { dragging = false; });
    }

    if (doneBtn) doneBtn.addEventListener('click', function () {
      Settings.save();
      window.location.href = 'countdown.html';
    });
    if (closeBtn) closeBtn.addEventListener('click', function () {
      Settings.save();
      window.location.href = 'countdown.html';
    });
    if (resetBtn) resetBtn.addEventListener('click', function () {
      // 恢复铃声与音量到默认值（不跳转）
      Settings.data.sound = Settings.defaults.sound;
      Settings.data.volume = Settings.defaults.volume;
      Settings.save();
      currentSound = Settings.defaults.sound;
      currentVolume = Settings.defaults.volume;
      selectOption(currentSound);
      setVolume(currentVolume);
    });

    // 初始化 UI
    selectOption(currentSound);
    setVolume(currentVolume);
  }

  // ---------- 顶部 Tab 导航（所有页面通用） ----------
  function initTabs() {
    var currentPage = document.body.getAttribute('data-page');
    var tabSw = $('[data-dom-id="tab-stopwatch"]');
    var tabCd = $('[data-dom-id="tab-countdown"]');
    if (tabSw) tabSw.addEventListener('click', function () {
      if (currentPage === 'stopwatch') return;
      window.location.href = 'index.html';
    });
    if (tabCd) tabCd.addEventListener('click', function () {
      if (currentPage === 'countdown') return;
      window.location.href = 'countdown.html';
    });
    var iconSettings = $('[data-dom-id="icon-settings"]');
    if (iconSettings) iconSettings.addEventListener('click', function () {
      if (currentPage === 'settings') return;
      window.location.href = 'settings.html';
    });
  }

  // ---------- 启动 ----------
  function init() {
    var body = document.body;
    var page = body.getAttribute('data-page');
    Settings.load();
    SoundEngine.setVolume(Settings.get('volume'));
    initTabs(); // 所有页面都初始化顶部导航
    if (page === 'stopwatch') initStopwatch();
    else if (page === 'countdown') initCountdown();
    else if (page === 'settings') initSettings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
