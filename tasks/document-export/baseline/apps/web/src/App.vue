<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
const session=ref(null), accounts=ref([]), documents=ref([]), selected=ref(null), draft=ref(''), title=ref(''), visibility=ref('private');
const accountInput=ref('alder-owner'), roleInput=ref(''), code=ref(''), stage=ref('account'), message=ref(''), error=ref(''), busy=ref(false);
let generation=0, channel;
const canWrite=computed(()=>session.value && ['owner','editor'].includes(session.value.role));
const draftKey=(context,id)=>`mal.draft.${context.tenant}.${context.account}.${context.role}.${id}`;
function csrf() { return document.cookie.split('; ').find(c=>c.startsWith('mal_csrf='))?.slice(9) || ''; }
async function api(path, options={}) {
  const headers={...(options.body ? {'Content-Type':'application/json'} : {})};
  if(options.method && options.method!=='GET' && session.value) { headers['X-CSRF-Token']=decodeURIComponent(csrf()); headers['X-Expected-Account']=session.value.account; headers['X-Expected-Role']=session.value.role; }
  const response=await fetch(path,{...options,headers});
  if(!response.ok) { const data=await response.json().catch(()=>({})); throw new Error(data.error || 'Request failed'); }
  return response.status===204 ? null : response.json();
}
function clearView() { documents.value=[]; selected.value=null; draft.value=''; title.value=''; }
async function hydrate(announce=false) {
  const current=++generation; clearView(); session.value=null; accounts.value=[];
  try {
    const context=await api('/api/session'); if(current!==generation) return; session.value=context;
    const [docs, saved]=await Promise.all([api('/api/documents'),api('/api/accounts')]);
    if(current!==generation) return; documents.value=docs.documents; accounts.value=saved.accounts;
  } catch { if(current===generation) session.value=null; }
  if(announce) channel?.postMessage({type:'session-changed'});
}
function addAccount() { ++generation; session.value=null; stage.value='account'; clearView(); }
function selectDoc(doc) { selected.value=doc; title.value=doc.title; visibility.value=doc.visibility; draft.value=localStorage.getItem(draftKey(session.value,doc._id)) ?? doc.body; }
function saveDraft() { if(selected.value && session.value) localStorage.setItem(draftKey(session.value,selected.value._id),draft.value); }
async function action(fn) { error.value='';message.value='';busy.value=true; try { await fn(); } catch(e) { error.value=e.message; } finally {busy.value=false;} }
async function requestCode() { await action(async()=>{ await api('/api/auth/challenge',{method:'POST',body:JSON.stringify({account:accountInput.value})}); stage.value='code';message.value='Check the local server terminal for your one-time code.'; }); }
async function signIn() { await action(async()=>{ await api('/api/auth/login',{method:'POST',body:JSON.stringify({account:accountInput.value,code:code.value,role:accountInput.value==='alder-multi' ? roleInput.value || undefined : undefined})}); code.value='';stage.value='account'; await hydrate(true); }); }
async function switchAccount(id) { await action(async()=>{ await api(`/api/accounts/${encodeURIComponent(id)}/activate`,{method:'POST'}); await hydrate(true); }); }
async function forget(id) { await action(async()=>{ await api(`/api/accounts/${encodeURIComponent(id)}`,{method:'DELETE'}); await hydrate(true); }); }
async function switchRole(event) { await action(async()=>{ await api('/api/session/role',{method:'POST',body:JSON.stringify({role:event.target.value})}); await hydrate(true); }); }
async function logout() { await action(async()=>{ await api('/api/session/logout',{method:'POST'}); await hydrate(true); }); }
async function saveDocument() { await action(async()=>{ const current=generation, context=session.value, id=selected.value._id; const doc=await api(`/api/documents/${id}`,{method:'PATCH',body:JSON.stringify({title:title.value,body:draft.value,visibility:visibility.value})}); if(current!==generation) return; localStorage.removeItem(draftKey(context,id)); selected.value=doc; documents.value=documents.value.map(d=>d._id===id?doc:d); message.value='Document saved.'; }); }
async function createDocument() { await action(async()=>{ const current=generation; const id=`doc-${crypto.randomUUID()}`; const doc=await api('/api/documents',{method:'POST',body:JSON.stringify({id,title:'Untitled document',body:'',visibility:'private'})}); if(current!==generation)return; documents.value.push(doc);selectDoc(doc); }); }
onMounted(()=>{ channel=typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mal.session') : null; if(channel) channel.onmessage=()=>hydrate(); hydrate(); });
onUnmounted(()=>channel?.close());
</script>
<template>
  <div class="app-shell">
    <header><div class="brand"><span class="mark">M</span><strong>MultiAuthLab</strong></div><div v-if="session" class="identity"><span>{{ session.name }} · {{ session.tenantName }}</span><button class="text-button" @click="logout" :disabled="busy">Sign out</button></div></header>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p><p v-if="message" class="notice" role="status">{{ message }}</p>
    <main v-if="!session" class="login-wrap">
      <div><p class="eyebrow">YOUR WORKSPACE</p><h1>Good work starts<br>with the right context.</h1><p class="muted">Sign in to access your organization's documents.</p></div>
      <form class="login-card" @submit.prevent="stage==='account' ? requestCode() : signIn()">
        <h2>Sign in</h2><p class="muted">Use a sample account to explore the workspace.</p>
        <label for="account">Account</label><select id="account" v-model="accountInput" :disabled="stage==='code'"><option value="alder-owner">Alex · Alder · owner</option><option value="alder-editor">Blair · Alder · editor</option><option value="alder-viewer">Casey · Alder · viewer</option><option value="alder-multi">Drew · Alder · multiple roles</option><option value="birch-owner">Ellis · Birch · owner</option></select>
        <template v-if="accountInput==='alder-multi'"><label for="login-role">Acting role</label><select id="login-role" v-model="roleInput"><option value="">Choose a role</option><option value="owner">Owner</option><option value="viewer">Viewer</option></select></template>
        <template v-if="stage==='code'"><label for="code">One-time code</label><input id="code" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required><p class="helper">Find the code in the local server terminal.</p></template>
        <button class="primary" :disabled="busy">{{ stage==='account' ? 'Send sign-in code' : 'Continue' }}</button><button v-if="stage==='code'" type="button" class="text-button" @click="stage='account'">Choose another account</button>
      </form>
    </main>
    <main v-else class="workspace">
      <aside><p class="eyebrow">ORGANIZATION</p><h2>{{ session.tenantName }}</h2><p class="muted">{{ session.name }}</p><label for="role">Acting role</label><select id="role" :value="session.role" @change="switchRole" :disabled="busy"><option v-for="role in session.roles" :key="role" :value="role">{{ role }}</option></select>
        <div class="aside-heading"><span>Saved accounts</span><button class="text-button" @click="addAccount">Add</button></div>
        <div v-for="account in accounts" :key="account.id" class="account-row"><button class="account-button" :disabled="busy || account.needsReauth" @click="switchAccount(account.id)"><strong>{{ account.name }}</strong><small>{{ account.tenant }}{{ account.needsReauth ? ' · Sign in again' : '' }}</small></button><button class="remove" :aria-label="`Forget ${account.name}`" @click="forget(account.id)">×</button></div>
      </aside>
      <section class="content"><div class="page-heading"><div><p class="eyebrow">YOUR WORKSPACE</p><h1>Documents</h1><p class="muted">A place for your team's work.</p></div><button v-if="canWrite" class="primary" @click="createDocument" :disabled="busy">New document</button></div>
        <div class="panes"><div class="doc-list"><button v-for="doc in documents" :key="doc._id" class="doc-row" :class="{active:selected?._id===doc._id}" @click="selectDoc(doc)"><strong>{{ doc.title }}</strong><small>{{ doc.visibility==='private' ? 'Private' : 'Organization' }}</small></button><p v-if="!documents.length" class="empty">No documents yet.</p></div>
          <div class="editor" v-if="selected"><label for="title">Title</label><input id="title" v-model="title" :disabled="!canWrite"><label for="body">Document</label><textarea id="body" v-model="draft" :disabled="!canWrite" @input="saveDraft"></textarea><label for="visibility">Visibility</label><select id="visibility" v-model="visibility" :disabled="!canWrite"><option value="private">Private</option><option value="tenant">Organization</option></select><button v-if="canWrite" class="primary" @click="saveDocument" :disabled="busy">Save changes</button><p v-if="canWrite" class="helper">Unsaved text is kept for this account and role on this browser.</p></div><div v-else class="empty editor-empty">Select a document to view it.</div></div>
      </section>
    </main>
  </div>
</template>
