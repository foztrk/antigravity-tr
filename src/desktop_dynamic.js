// Only recognized UI sentences are transformed; arbitrary numbers and content are untouched.
function translateDynamic(text) {
  const feedbackAccount = /^Send feedback as (.+@[^ ]+)$/.exec(text);
  if (feedbackAccount) return feedbackAccount[1] + ' Hesabıyla Geri Bildirim Gönder';
  const enabledTools = /^(\d+) tools? enabled$/.exec(text);
  if (enabledTools) return enabledTools[1] + ' Araç Etkin';
  const seeMore = /^(\+\s*)?See (\d+) more$/.exec(text);
  if (seeMore) return (seeMore[1] || '') + seeMore[2] + ' Tane Daha Göster';
  const workedDuration = /^Worked for (\d+h(?: \d+m)?|\d+m(?: \d+s)?)$/.exec(text);
  if (workedDuration) return workedDuration[1].replace(/[hms]/g, unit => ({h:' saat',m:' dakika',s:' saniye'}[unit])) + ' çalıştı';
  const ago = /^(\d+)(s|m|h|d) ago$/.exec(text);
  if (ago) return ago[1] + ' ' + ({s:'Saniye',m:'Dakika',h:'Saat',d:'Gün'}[ago[2]]) + ' Önce';
  const seeAll = /^See all \((\d+)\)$/.exec(text);
  if (seeAll) return 'Tümünü Gör (' + seeAll[1] + ')';
  const moreLines = /^(\+?\d+) more lines$/.exec(text);
  if (moreLines) return moreLines[1] + ' Satır Daha';
  const agentEdits = /^(.+) \(all agent edits\)$/.exec(text);
  if (agentEdits) return agentEdits[1] + ' (Tüm Ajan Düzenlemeleri)';
  const runningTasks = /^(\d+) tasks? running$/.exec(text);
  if (runningTasks) return runningTasks[1] + ' Görev Çalışıyor';
  const completedTask = /^(.+) finished$/.exec(text);
  if (completedTask) return completedTask[1] + ' Tamamlandı';
  const questionCount = /^(\d+) questions?$/.exec(text);
  if (questionCount) return questionCount[1] + ' Soru';
  const asked = /^Asked (\d+) questions?$/.exec(text);
  if (asked) return asked[1] + ' Soru Soruldu';
  const asking = /^Asking (\d+) questions?$/.exec(text);
  if (asking) return asking[1] + ' Soru Soruluyor';
  if (text.startsWith('(Recommended) ')) return '(Önerilen) ' + text.slice('(Recommended) '.length);
  const worked = /^Worked for (\d+)s$/.exec(text);
  if (worked) return worked[1] + ' saniye çalıştı';
  const activityParts = text.split(', ');
  const activities = { 'Exploring file': 'Dosya inceleniyor', 'Exploring files': 'Dosyalar inceleniyor', 'running commands': 'komutlar çalıştırılıyor', 'editing file': 'dosya düzenleniyor', 'editing files': 'dosyalar düzenleniyor' };
  if (activityParts.length && activityParts.every(part => Object.prototype.hasOwnProperty.call(activities, part))) return activityParts.map(part => activities[part]).join(', ');
  const explored = /^Explored (\d+ files?(?:, \d+ tasks?)?)(?:, ran (\d+) commands?)?$/.exec(text);
  if (explored) return explored[1].replace(/files?/g, 'dosya').replace(/tasks?/g, 'görev') + ' incelendi' + (explored[2] ? ', ' + explored[2] + ' komut çalıştırıldı' : '');
  const runningCommands = /^Running (\d+) commands?$/.exec(text);
  if (runningCommands) return runningCommands[1] + ' komut çalıştırılıyor';
  const ranCommands = /^Ran (\d+) commands?$/.exec(text);
  if (ranCommands) return ranCommands[1] + ' komut çalıştırıldı';
  const commandAction = /^(Ran|Run|Canceled) ((?:python|node|npm|git|powershell|pwsh|Get-ChildItem|Get-Content|Select-String) .+)$/.exec(text);
  if (commandAction) return ({ Ran: 'Çalıştırıldı: ', Run: 'Çalıştır: ', Canceled: 'İptal edildi: ' }[commandAction[1]]) + commandAction[2];
  const taskAction = /^(Checked|Killed) task (.+)$/.exec(text);
  if (taskAction) return (taskAction[1] === 'Checked' ? 'Görev kontrol edildi: ' : 'Görev sonlandırıldı: ') + taskAction[2];
  const analyzed = /^Analyzed (.+)$/.exec(text);
  if (analyzed) return 'İncelendi: ' + analyzed[1];
  const retry = /^Model unavailable, retrying in (\d+)s \(attempt (\d+)\/(\d+)\)(\.\.\.|…)$/.exec(text);
  if (retry) return 'Model kullanılamıyor; ' + retry[1] + ' saniye sonra yeniden denenecek (deneme ' + retry[2] + '/' + retry[3] + ')' + retry[4];
  const thought = /^Thought for (\d+(?:\.\d+)?)s$/.exec(text);
  if (thought) return thought[1] + ' saniye düşündü';
  const updatedTime = /^Updated (\d{1,2}:\d{2})$/.exec(text);
  if (updatedTime) return 'Güncellendi: ' + updatedTime[1];
  const consentPrefix = /^Yes, I agree to help improve Antigravity by allowing Google to collect and use my\s+Interactions data, subject to the(?=\s|$)/;
  if (consentPrefix.test(text)) return text.replace(consentPrefix, 'Evet, Google’ın etkileşim verilerimi aşağıdaki koşullara tabi olarak toplamasına ve kullanmasına izin vererek Antigravity’nin geliştirilmesine katkıda bulunmayı kabul ediyorum:');

  const updated = /^Updated (\d{1,2} [A-Za-zÇçĞğİıÖöŞşÜü.]+, \d{1,2}:\d{2})$/.exec(text);
  if (updated) return 'Güncellendi: ' + updated[1];
  const baselineQuota = /^Your plan's baseline quota will refresh on (.+?)\.(?: To continue using this model now, enable AI Credit overages\.)?$/.exec(text);
  if (baselineQuota) return 'Planınızın temel kotası ' + baselineQuota[1] + ' tarihinde yenilenecek.' + (text.endsWith('enable AI Credit overages.') ? ' Bu modeli şimdi kullanmaya devam etmek için AI kredisiyle kota aşımını etkinleştirin.' : '');
  if (text === 'tokens (') return 'token (';
  const breakdown = /^Show (\d+) breakdowns?$/.exec(text);
  if (breakdown) return breakdown[1] + ' Ayrıntıyı Göster';
  const tokenBudget = /^([\d.,]+\s*\/\s*[\d.,]+) tokens (\([\d.,]+%\))$/.exec(text);
  if (tokenBudget) return tokenBudget[1] + ' token ' + tokenBudget[2];
  const changedFiles = /^(\d+) files? changed$/.exec(text);
  if (changedFiles) return changedFiles[1] + ' Dosya Değiştirildi';
  const readAll = /^Mark all (\d+) conversations as read$/.exec(text);
  if (readAll) return readAll[1] + ' Konuşmanın Tümünü Okundu Olarak İşaretle';
  const credits = /^Available AI Credits:\s*([\d.,]+)$/.exec(text);
  if (credits) return 'Kullanılabilir AI Kredisi: ' + credits[1];
  if (text === 'tokens)') return 'token)';
  function duration(value) {
    if (!/^(?:\d+\s*(?:days?|hours?|minutes?|seconds?|d|h|m|s)(?:,?\s*|$))+$/.test(value)) return null;
    return value.replace(/(\d+)\s*(days?|hours?|minutes?|seconds?|d|h|m|s)\b/g,
      (_, n, unit) => n + ' ' + ({ d: 'gün', h: 'saat', m: 'dakika', s: 'saniye' }[unit[0]]));
  }
  let match = /^Resets in (.+)$/.exec(text);
  if (match) { const time = duration(match[1]); return time ? time + ' sonra yenilenir' : text; }
  match = /^You have hit your weekly limit, the 5-hour limit does not currently apply\. Your weekly limit will fully refresh in (.+)\.$/.exec(text);
  if (match) { const time = duration(match[1]); return time ? 'Haftalık limitinize ulaştınız; beş saatlik limit şu anda geçerli değil. Haftalık limitiniz ' + time + ' sonra tamamen yenilenir.' : text; }
  match = /^(Claude (?:Sonnet|Opus) [\d.]+|GPT-OSS \d+B) \((Thinking|Medium|High|Low)\)$/.exec(text);
  if (match) return match[1] + ' (' + ({ Thinking: 'Düşünme', Medium: 'Orta', High: 'Yüksek', Low: 'Düşük' }[match[2]]) + ')';
  match = /^You have used some of your (weekly|5-hour) limit, it will fully refresh in (.+)\.$/.exec(text);
  if (match) {
    const time = duration(match[2]);
    return time ? (match[1] === 'weekly' ? 'Haftalık' : 'Beş saatlik') + ' limitinizin bir kısmını kullandınız. Limit ' + time + ' sonra tamamen yenilenir.' : text;
  }
  match = /^You have hit your 5-hour limit, so the weekly limit does not currently apply\. Your 5-hour limit will refresh in (.+)\.$/.exec(text);
  if (match) { const time = duration(match[1]); return time ? 'Beş saatlik limitinize ulaştınız; haftalık limit şu anda geçerli değil. Beş saatlik limitiniz ' + time + ' sonra yenilenir.' : text; }
  match = /^You have hit your (weekly|5-hour) limit, it (?:will refresh|refreshes) in (.+)\. If on a supported paid plan, you can use AI credits in the interim( or upgrade to a higher tier)?\.$/.exec(text);
  if (match) {
    const time = duration(match[2]);
    return time ? (match[1] === 'weekly' ? 'Haftalık' : 'Beş saatlik') + ' limitinize ulaştınız. Limit ' + time + ' sonra yenilenir. Desteklenen ücretli bir plandaysanız bu sırada AI kredilerini kullanabilirsiniz' + (match[3] ? ' veya daha yüksek bir plana geçebilirsiniz.' : '.') : text;
  }
  match = /^(\(?[\d.,]+) tokens(\)?)$/.exec(text);
  if (match) return match[1] + ' token' + match[2];
  return text;
}
module.exports = { translateDynamic };
