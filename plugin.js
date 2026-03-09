// ====================
// HabitFlow — Amplenote Plugin
// Habit & Mood Tracker with Streaks
// ====================

const plugin = {
  constants: {
    TRACKER_NOTE_TITLE: "HabitFlow Tracker",
    MOOD_NOTE_TITLE: "HabitFlow Mood Log",
    VERSION: "1.0",
  },

  // ─── Plugin Settings ────────────────────────────────────
  options: {
    "Default frequency": {
      type: "select",
      options: ["daily", "weekly"],
      default: "daily",
      description: "Default frequency for new habits",
    },
    "Mood reminder": {
      type: "select",
      options: ["Morning", "Evening", "Both", "None"],
      default: "Evening",
      description: "When to prompt for mood logging",
    },
  },

  // ─── Note Actions ────────────────────────────────────────
  noteOptions: {
    "Add New Habit": async function (app) {
      const name = await app.prompt("Habit name:", {
        inputs: [{ type: "text", label: "Name" }],
      });
      if (!name) return;

      const category = await app.prompt("Category:", {
        inputs: [{
          type: "select",
          label: "Category",
          options: [
            { value: "Health", label: "Health 💊" },
            { value: "Fitness", label: "Fitness 🏋️" },
            { value: "Mindfulness", label: "Mindfulness 🧘" },
            { value: "Productivity", label: "Productivity ⚡" },
            { value: "Learning", label: "Learning 📚" },
            { value: "Social", label: "Social 👥" },
            { value: "Creative", label: "Creative 🎨" },
          ],
        }],
      });
      if (!category) return;

      const frequency = await app.prompt("Frequency:", {
        inputs: [{
          type: "select",
          label: "Frequency",
          options: [
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
          ],
        }],
      });

      const icons = { Health: "💊", Fitness: "🏋️", Mindfulness: "🧘", Productivity: "⚡", Learning: "📚", Social: "👥", Creative: "🎨" };
      const icon = icons[category] || "📌";
      const id = "h_" + Date.now();
      const today = new Date().toISOString().split("T")[0];

      // Find or create tracker note
      let noteUUID = await app.findNote({ name: plugin.constants.TRACKER_NOTE_TITLE });
      if (!noteUUID) {
        noteUUID = await app.createNote(plugin.constants.TRACKER_NOTE_TITLE);
        await app.insertNoteContent(noteUUID, "# HabitFlow Tracker\n\n");
      }

      // Add habit as recurring task
      const taskContent = `- [ ] ${icon} ${name} {frequency: ${frequency || "daily"}, id: ${id}, category: ${category}, created: ${today}} \\repeatTask{${frequency === "weekly" ? "every 1 week" : "every 1 day"}}\n`;
      await app.insertNoteContent(noteUUID, taskContent);

      app.alert(`✅ Habit "${name}" added! It will appear as a recurring task.`);
    },

    "Log Mood": async function (app) {
      const moodChoice = await app.prompt("How are you feeling?", {
        inputs: [{
          type: "select",
          label: "Mood",
          options: [
            { value: "1", label: "😞 Terrible (1)" },
            { value: "2", label: "😕 Bad (2)" },
            { value: "3", label: "😐 Okay (3)" },
            { value: "4", label: "🙂 Good (4)" },
            { value: "5", label: "😄 Great (5)" },
          ],
        }],
      });
      if (!moodChoice) return;

      const tags = await app.prompt("Context tags (comma-separated):", {
        inputs: [{
          type: "text",
          label: "Tags",
          placeholder: "exercise, sleep, stress, social, work",
        }],
      });

      const note = await app.prompt("Any notes? (optional)", {
        inputs: [{ type: "text", label: "Note" }],
      });

      const today = new Date().toISOString().split("T")[0];
      const emojis = { "1": "😞", "2": "😕", "3": "😐", "4": "🙂", "5": "😄" };
      const tagList = tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [];

      let noteUUID = await app.findNote({ name: plugin.constants.MOOD_NOTE_TITLE });
      if (!noteUUID) {
        noteUUID = await app.createNote(plugin.constants.MOOD_NOTE_TITLE);
        await app.insertNoteContent(noteUUID, "# HabitFlow Mood Log\n\n| Date | Mood | Tags | Note |\n|------|------|------|------|\n");
      }

      const entry = `| ${today} | ${emojis[moodChoice]} ${moodChoice}/5 | ${tagList.join(", ")} | ${note || ""} |\n`;
      await app.insertNoteContent(noteUUID, entry);

      app.alert(`${emojis[moodChoice]} Mood logged for ${today}!`);
    },

    "Check Streaks": async function (app) {
      const noteUUID = await app.findNote({ name: plugin.constants.TRACKER_NOTE_TITLE });
      if (!noteUUID) {
        app.alert("No habits found. Add some habits first!");
        return;
      }

      const content = await app.getNoteContent(noteUUID);
      const habits = parseHabits(content);
      const tasks = await app.getNoteTasks(noteUUID);

      let report = "\n---\n## 📊 Streak Report — " + new Date().toLocaleDateString() + "\n\n";
      report += "| Habit | Current | Best | Total | Rate |\n";
      report += "|-------|---------|------|-------|------|\n";

      for (const habit of habits) {
        const completions = getCompletions(tasks, habit.id);
        const { current, longest } = calcStreak(completions);
        const daysSince = Math.max(1, Math.floor((Date.now() - new Date(habit.created).getTime()) / 86400000));
        const rate = Math.round((completions.length / daysSince) * 100);
        const fire = current >= 7 ? " 🔥" : "";
        report += `| ${habit.icon} ${habit.name}${fire} | ${current}d | ${longest}d | ${completions.length} | ${rate}% |\n`;
      }

      await app.insertNoteContent(noteUUID, report);
      app.alert("📊 Streak report inserted!");
    },

    "Export Stats JSON": async function (app) {
      const trackerUUID = await app.findNote({ name: plugin.constants.TRACKER_NOTE_TITLE });
      const moodUUID = await app.findNote({ name: plugin.constants.MOOD_NOTE_TITLE });

      const habits = [];
      if (trackerUUID) {
        const content = await app.getNoteContent(trackerUUID);
        const tasks = await app.getNoteTasks(trackerUUID);
        const parsed = parseHabits(content);

        for (const h of parsed) {
          const completions = getCompletions(tasks, h.id);
          const { current, longest } = calcStreak(completions);
          habits.push({
            id: h.id,
            name: h.name,
            category: h.category,
            icon: h.icon,
            frequency: h.frequency,
            createdAt: h.created,
            completions: completions,
            currentStreak: current,
            longestStreak: longest,
            totalCompletions: completions.length,
          });
        }
      }

      const moods = [];
      if (moodUUID) {
        const moodContent = await app.getNoteContent(moodUUID);
        moods.push(...parseMoodLog(moodContent));
      }

      const exportData = {
        version: plugin.constants.VERSION,
        exportedAt: new Date().toISOString(),
        habits,
        moods,
      };

      const json = JSON.stringify(exportData, null, 2);

      // Insert into note as code block
      const exportNote = await app.createNote("HabitFlow Export — " + new Date().toLocaleDateString());
      await app.insertNoteContent(exportNote, `# HabitFlow Export\n\n\`\`\`json\n${json}\n\`\`\`\n\nCopy the JSON above and paste it into the HabitFlow web dashboard.`);

      app.alert("📦 Export created! Check the new note for the JSON data.");
    },
  },
};

// ─── Helper Functions ────────────────────────────────────

function parseHabits(content) {
  const regex = /- \[[ x]\] (.+?) \{frequency: (\w+), id: (\w+), category: (\w+), created: ([\d-]+)\}/g;
  const habits = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const iconMatch = match[1].match(/^(\p{Emoji})/u);
    habits.push({
      name: match[1].replace(/^\p{Emoji}\s*/u, "").trim(),
      icon: iconMatch ? iconMatch[1] : "📌",
      frequency: match[2],
      id: match[3],
      category: match[4],
      created: match[5],
    });
  }
  return habits;
}

function getCompletions(tasks, habitId) {
  // Extract completion dates from task history
  return tasks
    .filter(t => t.content && t.content.includes(habitId) && t.completedAt)
    .map(t => t.completedAt.split("T")[0])
    .sort();
}

function calcStreak(completions) {
  if (!completions.length) return { current: 0, longest: 0 };
  const sorted = [...new Set(completions)].sort();
  let longest = 1, streak = 1, current = 0;

  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000;
    if (diff === 1) streak++;
    else { longest = Math.max(longest, streak); streak = 1; }
  }
  longest = Math.max(longest, streak);

  const today = new Date().toISOString().split("T")[0];
  current = 0;
  for (let i = 0; ; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (sorted.includes(d.toISOString().split("T")[0])) current++;
    else break;
  }

  return { current, longest };
}

function parseMoodLog(content) {
  const lines = content.split("\n").filter(l => l.startsWith("|") && !l.includes("---") && !l.includes("Date"));
  return lines.map(line => {
    const cols = line.split("|").map(c => c.trim()).filter(Boolean);
    if (cols.length < 3) return null;
    const scoreMatch = cols[1].match(/(\d)\/5/);
    return {
      date: cols[0],
      score: scoreMatch ? parseInt(scoreMatch[1]) : 3,
      tags: cols[2] ? cols[2].split(",").map(t => t.trim()).filter(Boolean) : [],
      note: cols[3] || undefined,
    };
  }).filter(Boolean);
}

export default plugin;