<script setup>
import { onMounted, ref } from 'vue';
const status = ref('Checking API…');
onMounted(async () => {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('API unavailable');
    const result = await response.json();
    status.value = result.status === 'ok' ? 'API connected' : 'API unavailable';
  } catch { status.value = 'API unavailable'; }
});
</script>
<template>
  <main>
    <header><span class="mark">M</span><strong>MultiAuthLab</strong><span class="status">{{ status }}</span></header>
    <section><p class="eyebrow">WORKSPACE</p><h1>A place to work<br>across teams.</h1><p class="intro">A small document workspace for exploring how coding agents handle identity and access.</p><div class="card"><span class="label">GETTING STARTED</span><h2>Workspace foundation</h2><p>The application is being built. Accounts, sessions, and documents will be added in the next checkpoint.</p></div></section>
  </main>
</template>
