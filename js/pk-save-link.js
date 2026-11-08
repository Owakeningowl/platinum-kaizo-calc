/* Link your Platinum Kaizo save: the calculator re-reads it whenever it changes and updates Team / Box.
   It replaces the calculator's Sync (Lua) and Upload Save buttons. The file is read in this page, never uploaded.

   Pick ~/PK Saves/PK Latest.dat, which a small background job on your Mac keeps equal to your newest in-game
   save or DeSmuME save state (Chrome may not open DeSmuME's own folder in ~/Library). Plain .sav / .dsv files
   work too. Chrome / Edge keep the link and check the file every 2 seconds; other browsers use Load save file.

   Every Pokémon goes through the calculator's own addSavePokemon(), exactly like its Upload Save did, so sets,
   evolutions (matched by PID, IVs and met level) and the dead boxes (420+) behave the same. */
(function () {
	var RAM = 0x02000000, SAVE_PTR = 0x02101D40, GAME_CODE = 0x023FFE0C;       // Platinum Kaizo (JAK7) memory
	var SMALL = 0xCF2C, LARGE_END = 0x1F110, SECOND = 0x40000, MAGIC = 0x20060623;
	var PARTY = 236, BOXED = 136, BOX_SLOTS = 540, ALIVE_SLOTS = 420;

	function u32(b, o) { return (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0; }
	function fail(code) { var e = new Error(code); e.code = code; return e; }

	function inflate(bytes) {
		var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
		return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
	}

	// A DeSmuME save state: the game's live save data sits in main RAM, laid out like the save file's blocks.
	function fromState(b) {
		var size = u32(b, 28);
		return inflate(b.subarray(32, 32 + size)).then(function (raw) {
			var ram = null;
			for (var o = 0; o + 8 <= raw.length && !ram;) {
				var id = u32(raw, o), len = u32(raw, o + 4);
				if (id === 4) {
					for (var p = o + 8; p + 12 <= o + 8 + len;) {
						var key = String.fromCharCode(raw[p], raw[p + 1], raw[p + 2], raw[p + 3]);
						var n = u32(raw, p + 4) * u32(raw, p + 8);
						if (key === 'WRAM') { ram = raw.subarray(p + 12, p + 12 + n); break; }
						p += 12 + n;
					}
				}
				o += 8 + len;
			}
			if (!ram) throw fail('format');
			var code = String.fromCharCode(ram[GAME_CODE - RAM], ram[GAME_CODE - RAM + 1], ram[GAME_CODE - RAM + 2], ram[GAME_CODE - RAM + 3]);
			if (code !== 'JAK7' && code !== 'CPUE') throw fail('game');
			var base = u32(ram, SAVE_PTR - RAM) + 0x14 - RAM;
			if (base < 0 || base + LARGE_END > ram.length || u32(ram, base + 0x98) !== 6) throw fail('title');
			return {small: ram.subarray(base, base + SMALL), large: ram.subarray(base + SMALL, base + LARGE_END), from: 'save state'};
		});
	}

	// A .sav / .dsv: the newer of its two copies, chosen the way the calculator's Upload Save chose it.
	function fromSave(b) {
		if (b.length < 0x80000) throw fail('format');
		var s1 = b.subarray(0, SMALL), s2 = b.subarray(SECOND, SECOND + SMALL);
		var l1 = b.subarray(SMALL, LARGE_END), l2 = b.subarray(SECOND + SMALL, SECOND + LARGE_END);
		var ok1 = u32(s1, SMALL - 8) === MAGIC, ok2 = u32(s2, SMALL - 8) === MAGIC;
		if (!ok1 && !ok2) throw fail('empty');
		var small = !ok1 ? s2 : ok2 && u32(s2, SMALL - 16) > u32(s1, SMALL - 16) ? s2 : s1;
		var large = u32(small, SMALL - 20) === u32(l1, l1.length - 20) ? l1 : l2;
		return {small: small, large: large, from: 'in-game save'};
	}

	var TEAM_KEY = 'pk-link-team';

	// Party Pokémon go to Team, in party order. The calculator stores each set with an id that starts with its PID.
	function placeTeam(sets) {
		var team = $('#team');
		sets.forEach(function (set) {
			var icon = $('.team-box .pokemon-icon').filter(function () { return $(this).attr('data-set') === set; });
			if (icon.length) team.append(icon);
		});
	}

	function partySets(pids) {
		var saved = {};
		try { saved = JSON.parse(localStorage.customsets || '{}'); } catch (e) {}
		return pids.map(function (pid) {
			for (var name in saved) for (var label in saved[name]) {
				var data = saved[name][label].data;
				if (data && data.id && data.id.indexOf(pid + '-') === 0) return name + ' (' + label + ')';
			}
			return null;
		}).filter(Boolean);
	}

	function install(blocks) {
		var team = 0, box = 0, skipped = 0, i, pids = [];
		var count = Math.min(blocks.small[0x9C], 6);
		for (i = 0; i < count; i++) {
			var mon = blocks.small.subarray(0xA0 + i * PARTY, 0xA0 + (i + 1) * PARTY);
			try {
				if (addSavePokemon(Array.from(mon))) {
					team++;
					pids.push(u32(mon, 0).toString(16).padStart(8, '0'));
				}
			} catch (e) { skipped++; }
		}
		for (i = 0; i < BOX_SLOTS; i++) {
			var slot = blocks.large.subarray(4 + i * BOXED, 4 + (i + 1) * BOXED);
			if (!(slot[0] | slot[1] | slot[2] | slot[3] | slot[4] | slot[5] | slot[6] | slot[7])) continue;   // empty
			try { if (addSavePokemon(Array.from(slot), i >= ALIVE_SLOTS)) box++; }
			catch (e) { skipped++; }
		}
		if (team || box) {
			var sets = partySets(pids);
			placeTeam(sets);
			try { localStorage.setItem(TEAM_KEY, JSON.stringify(sets)); } catch (e) {}
			$(allPokemon('#importedSetsOptions')).css('display', 'inline');
			applyIconColors();
		}
		return {team: team, box: box, skipped: skipped, from: blocks.from};
	}

	function read(bytes) {
		var isState = String.fromCharCode.apply(null, bytes.subarray(0, 14)) === 'DeSmuME SState';
		return Promise.resolve(isState ? fromState(bytes) : fromSave(bytes)).then(install);
	}

	/* ---------- the bar ---------- */
	var linkButton, syncButton, pickLabel, status, handle = null, lastModified = 0, timer = null;
	var canLink = typeof window.showOpenFilePicker === 'function' && window.indexedDB;

	function say(text, bad) {
		status.textContent = text;
		status.hidden = false;
		status.classList.toggle('pk-bad', !!bad);
	}

	function load(bytes, when) {
		return read(bytes).then(function (r) {
			if (!r.team && !r.box) throw fail('none');
			say('Synced from your ' + r.from + (when ? ' at ' + when : '') + ': ' + r.team + ' in your party, ' + r.box +
				' in your boxes' + (r.skipped ? ' (skipped ' + r.skipped + ' unreadable)' : '') + '.');
		});
	}
	window.PKSaveLink = {load: load};

	function problem(e) {
		var code = e && e.code;
		if (!code && window.console) console.error('Save link:', e);
		say(code === 'empty' ? 'That save has no game data yet. Save in-game once.'
			: code === 'title' ? 'That save state is from the title screen. Save a state once you are in the game.'
			: code === 'game' ? 'That save state is from another game.'
			: code === 'none' ? 'No Pokémon in that save yet.'
			: code === 'format' ? 'That doesn’t look like a Platinum Kaizo save or DeSmuME save state.'
			: 'Couldn’t read the save' + (e && e.name ? ' (' + e.name + ')' : '') + '. Try Load save file.', true);
	}

	function db(mode, fn) {
		return new Promise(function (resolve, reject) {
			var req = indexedDB.open('pk-save-link', 1);
			req.onupgradeneeded = function () { req.result.createObjectStore('handles'); };
			req.onerror = function () { reject(req.error); };
			req.onsuccess = function () {
				var tx = req.result.transaction('handles', mode), r = fn(tx.objectStore('handles'));
				tx.oncomplete = function () { resolve(r && r.result); };
				tx.onerror = function () { reject(tx.error); };
			};
		});
	}

	function poll() {
		if (!handle || document.visibilityState !== 'visible') return;
		handle.getFile().then(function (file) {
			if (file.lastModified === lastModified) return;
			lastModified = file.lastModified;
			return file.arrayBuffer().then(function (buf) {
				return load(new Uint8Array(buf), new Date(file.lastModified).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}));
			}).catch(problem);
		}).catch(function (e) {
			if (window.console) console.error('Save link:', e);
			clearInterval(timer);
			timer = null;
			syncButton.hidden = false;
			say('Lost access to the save' + (e && e.name ? ' (' + e.name + ')' : '') + '. Press Sync now, or use Load save file.', true);
		});
	}

	function start() {
		syncButton.hidden = true;
		linkButton.textContent = 'Link a different save';
		if (!timer) timer = setInterval(poll, 2000);
		poll();
	}

	$(document).ready(function () {
		$('#sync, #upload, #saveFile').remove();                    // the calculator's own Sync / Upload Save
		var box = $('fieldset.team-box legend').first();
		if (!box.length) return;
		var bar = $('<div id="pk-link-bar">' +
			'<button type="button" id="pk-link">Link save</button>' +
			'<button type="button" id="pk-sync" hidden>Sync now</button>' +
			'<label id="pk-pick" class="pk-pick">Load save file<input type="file" id="pk-file" hidden></label>' +
			'<span id="pk-status" hidden></span></div>');
		box.after(bar);
		try { placeTeam(JSON.parse(localStorage.getItem(TEAM_KEY) || '[]')); } catch (e) {}   // the last synced team
		linkButton = document.getElementById('pk-link');
		syncButton = document.getElementById('pk-sync');
		pickLabel = document.getElementById('pk-pick');
		status = document.getElementById('pk-status');

		if (canLink) {
			linkButton.addEventListener('click', function () {
				window.showOpenFilePicker().then(function (picked) {         // no type filter: macOS has no file type for .dsv
					handle = picked[0];
					lastModified = 0;
					return db('readwrite', function (s) { return s.put(handle, 'save'); }).then(start);
				}).catch(function (e) { if (e && e.name !== 'AbortError') problem(e); });
			});
			syncButton.addEventListener('click', function () {
				if (!handle) return;
				handle.requestPermission({mode: 'read'}).then(function (state) {
					if (state === 'granted') start();
					else say('The browser didn’t allow reading the save. Use Load save file instead.', true);
				}).catch(problem);
			});
			db('readonly', function (s) { return s.get('save'); }).then(function (saved) {
				if (!saved) return;
				handle = saved;
				linkButton.textContent = 'Link a different save';
				return handle.queryPermission({mode: 'read'}).then(function (state) {
					if (state === 'granted') start();
					else { syncButton.hidden = false; say('Press Sync now to keep reading ' + handle.name + '.'); }
				});
			}).catch(function () {});
			document.addEventListener('visibilitychange', poll);
		} else {
			linkButton.hidden = true;
		}

		document.getElementById('pk-file').addEventListener('change', function (event) {
			var file = event.target.files[0];
			if (!file) return;
			file.arrayBuffer().then(function (buf) { return load(new Uint8Array(buf)); }).catch(problem)
				.then(function () { event.target.value = ''; });
		});
	});
})();
