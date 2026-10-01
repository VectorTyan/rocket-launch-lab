# 本地发射口令

使用本机安装的 Microsoft Kangkang 中文语音合成数字“十”到“一”及“点火”“起飞”，不是现场录音或特定播音员的声音。运行时从本地加载，不使用麦克风或在线语音服务。12 段音频的时长、字节数及 SHA-256 见 `manifest.json`。

格式为 PCM WAV、22.05 kHz、16-bit、单声道。数字单段约 0.30～0.42 秒，点火与起飞单段约 0.55 秒；去掉首尾多余静音、统一峰值并添加短淡入淡出，使数字适合一秒一拍。播放器最多保留当前一段，不积压旧数字。

倒计时对准所选型号现有点火事件。任务从 T−10 秒开始，因此猎鹰 9 号在 T−3 秒点火前倒数 7～1；点火后到 T+0 秒再播报起飞。其他型号按其已有事件计算，不修改原任务时间。

重新生成（需要已安装对应语音的 Windows）：

```powershell
./scripts/generate-countdown.ps1
node scripts/prepare-countdown-audio.mjs
```

在项目根目录执行。生成后运行 `node --test tests/countdown-assets.test.js`，检查音频非空、时长和校验值；正常游戏播放不需要安装该系统语音。
