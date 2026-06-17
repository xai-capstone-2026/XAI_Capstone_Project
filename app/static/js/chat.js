const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatWindow = document.getElementById('chat-window');
const messages = document.getElementById('messages');
const sendBtn = document.getElementById('send-btn');
const resetBtn = document.getElementById('reset-btn');

const helpBtn = document.getElementById('help-btn');
const sidebar = document.querySelector('.sidebar');
const sidebarClose = document.getElementById('sidebar-close');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

const currentChatTitle = document.getElementById('current-chat-title');
const DEFAULT_TOPBAR_TITLE = '복지정책 XAI 상담 채팅';

const conversationPanel = document.querySelector('.conversation-panel');
const conversationToggleBtn = document.getElementById('conversation-toggle-btn');
const conversationClose = document.getElementById('conversation-close');
const conversationBackdrop = document.getElementById('conversation-backdrop');

const exampleChips = document.querySelectorAll('.example-chip');

const heatmapModal = document.getElementById('heatmap-modal');
const heatmapBackdrop = document.getElementById('heatmap-backdrop');
const heatmapClose = document.getElementById('heatmap-close');
const heatmapContent = document.getElementById('heatmap-content');

const deleteModal = document.getElementById('delete-modal');
const deleteBackdrop = document.getElementById('delete-backdrop');
const deleteClose = document.getElementById('delete-close');
const deleteCancel = document.getElementById('delete-cancel');
const deleteConfirm = document.getElementById('delete-confirm');
const deleteDescription = document.getElementById('delete-description');

const conversationList = document.getElementById('conversation-list');
const newChatBtn = document.getElementById('new-chat-btn');
const introCard = document.querySelector('.intro-card');

const DEFAULT_ASSISTANT_MESSAGE =
    '안녕하세요! 자격증, 월세, 취업, 창업, 면접 준비처럼 궁금한 정책을 말씀해 주세요.\n' +
    '상황을 조금 더 자세히 적어주시면 더 적합한 지원 제도를 정리해드릴게요.';

const userId = localStorage.getItem('chat_user_id') || (() => {
    const id = `user_${crypto.randomUUID()}`;
    localStorage.setItem('chat_user_id', id);
    return id;
})();

let currentConversationId = localStorage.getItem('current_conversation_id') || '';
let editingConversationId = '';
let pendingDeleteConversation = null;

/* -----------------------------
 * Layout / viewport helpers
 * ----------------------------- */
function setAppHeight() {
    const viewportHeight = window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight;

    document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
}

function lockOverlayScroll() {
    document.body.classList.add('sidebar-open');
}

function unlockOverlayScrollIfNeeded() {
    const sidebarOpen = sidebar?.classList.contains('is-open');
    const conversationOpen = conversationPanel?.classList.contains('is-open');

    if (!sidebarOpen && !conversationOpen) {
        document.body.classList.remove('sidebar-open');
    }
}

function openSidebar() {
    if (window.innerWidth > 960) return;

    closeConversationPanel();

    sidebar.classList.add('is-open');
    sidebarBackdrop.classList.add('is-open');
    lockOverlayScroll();
    helpBtn?.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
    sidebar.classList.remove('is-open');
    sidebarBackdrop.classList.remove('is-open');
    helpBtn?.setAttribute('aria-expanded', 'false');
    unlockOverlayScrollIfNeeded();
}

function openConversationPanel() {
    if (window.innerWidth > 960) return;

    closeSidebar();

    conversationPanel.classList.add('is-open');
    conversationBackdrop.classList.add('is-open');
    lockOverlayScroll();
    conversationToggleBtn?.setAttribute('aria-expanded', 'true');
}

function closeConversationPanel() {
    conversationPanel?.classList.remove('is-open');
    conversationBackdrop?.classList.remove('is-open');
    conversationToggleBtn?.setAttribute('aria-expanded', 'false');
    unlockOverlayScrollIfNeeded();
}

function openDeleteModal(conversation) {
    pendingDeleteConversation = conversation;
    deleteDescription.textContent = `"${conversation.title || '새 채팅'}" 대화를 삭제할까요?`;
    deleteModal.hidden = false;
    document.body.classList.add('sidebar-open');
}

function closeDeleteModal() {
    deleteModal.hidden = true;
    pendingDeleteConversation = null;
    unlockOverlayScrollIfNeeded();
}

setAppHeight();
window.addEventListener('resize', setAppHeight);

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight);
    window.visualViewport.addEventListener('scroll', setAppHeight);
}

window.addEventListener('resize', () => {
    if (window.innerWidth > 960) {
        closeSidebar();
        closeConversationPanel();
    }
});

helpBtn?.addEventListener('click', openSidebar);
sidebarClose?.addEventListener('click', closeSidebar);
sidebarBackdrop?.addEventListener('click', closeSidebar);

conversationToggleBtn?.addEventListener('click', openConversationPanel);
conversationClose?.addEventListener('click', closeConversationPanel);
conversationBackdrop?.addEventListener('click', closeConversationPanel);

/* -----------------------------
 * Shared utility
 * ----------------------------- */
function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderMarkdown(text) {
    const rawHtml = marked.parse(text || '', { breaks: true });
    return DOMPurify.sanitize(rawHtml);
}

function getTimeLabel() {
    const now = new Date();
    return now.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatConversationDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function autoResizeTextarea() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

function scrollToBottom(forceSmooth = false) {
    if (forceSmooth) {
        chatWindow.scrollTo({
            top: chatWindow.scrollHeight,
            behavior: 'smooth'
        });
        return;
    }

    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showIntroCard() {
    if (introCard) {
        introCard.style.display = '';
    }
}

function hideIntroCard() {
    if (introCard) {
        introCard.style.display = 'none';
    }
}

function getDisplayConversationTitle(title) {
    const normalized = (title || '').trim();

    if (!normalized || normalized === '새 채팅') {
        return DEFAULT_TOPBAR_TITLE;
    }

    return normalized;
}

function setCurrentChatTitle(title) {
    if (!currentChatTitle) return;
    currentChatTitle.textContent = getDisplayConversationTitle(title);
}

function applyCurrentConversationTitleFromConversation(conversation) {
    setCurrentChatTitle(conversation?.title);
}

function applyCurrentConversationTitleFromList(conversations) {
    const current = (conversations || []).find(
        (item) => item.conversation_id === currentConversationId
    );
    setCurrentChatTitle(current?.title);
}

/* -----------------------------
 * API helpers
 * ----------------------------- */
async function fetchJson(url, options = {}, fallbackMessage = '요청 처리 중 오류가 발생했습니다.') {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data?.detail || fallbackMessage);
    }

    return data;
}

async function createConversation(title = '새 채팅') {
    const data = await fetchJson(
        '/conversations',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                title
            })
        },
        '새 대화방 생성 오류'
    );

    return data.conversation;
}

async function fetchConversationList() {
    const data = await fetchJson(
        `/conversations?user_id=${encodeURIComponent(userId)}`,
        {},
        '대화 목록 조회 오류'
    );

    return data.conversations || [];
}

async function fetchConversationDetail(conversationId) {
    const data = await fetchJson(
        `/conversations/${encodeURIComponent(conversationId)}?user_id=${encodeURIComponent(userId)}`,
        {},
        '대화방 조회 오류'
    );

    return data.conversation;
}

async function updateConversationTitleApi(conversationId, title) {
    const data = await fetchJson(
        `/conversations/${encodeURIComponent(conversationId)}/title`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                title
            })
        },
        '대화 제목 수정 오류'
    );

    return data.conversation;
}

async function deleteConversationApi(conversationId) {
    return fetchJson(
        `/conversations/${encodeURIComponent(conversationId)}?user_id=${encodeURIComponent(userId)}`,
        {
            method: 'DELETE'
        },
        '대화 삭제 오류'
    );
}

async function callChatAPI(message) {
    const conversationId = await ensureConversationReady();

    return fetchJson(
        '/chat',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                conversation_id: conversationId,
                message
            })
        },
        '채팅 응답 오류'
    );
}

async function callCaptumAPI(message) {
    const conversationId = await ensureConversationReady();

    return fetchJson(
        '/captum',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                conversation_id: conversationId,
                message
            })
        },
        'Captum 응답 오류'
    );
}

/* -----------------------------
 * Conversation lifecycle
 * ----------------------------- */
async function ensureConversationReady() {
    if (currentConversationId) {
        return currentConversationId;
    }

    const conversation = await createConversation('새 채팅');
    currentConversationId = conversation.conversation_id;
    localStorage.setItem('current_conversation_id', currentConversationId);
    return currentConversationId;
}

async function refreshConversationList() {
    const conversations = await fetchConversationList();
    renderConversationList(conversations);
    applyCurrentConversationTitleFromList(conversations);
}

async function createAndSwitchConversation() {
    const conversation = await createConversation('새 채팅');
    currentConversationId = conversation.conversation_id;
    localStorage.setItem('current_conversation_id', currentConversationId);

    await loadCurrentConversation();
    await refreshConversationList();

    if (window.innerWidth <= 960) {
        closeConversationPanel();
    }
}

async function deleteConversationAndRecover(conversationId) {
    await deleteConversationApi(conversationId);

    if (currentConversationId === conversationId) {
        currentConversationId = '';
        localStorage.removeItem('current_conversation_id');

        const conversations = await fetchConversationList();

        if (conversations.length > 0) {
            currentConversationId = conversations[0].conversation_id;
            localStorage.setItem('current_conversation_id', currentConversationId);
        } else {
            const newConversation = await createConversation('새 채팅');
            currentConversationId = newConversation.conversation_id;
            localStorage.setItem('current_conversation_id', currentConversationId);
        }

        await loadCurrentConversation();
    }

    await refreshConversationList();
}

/* -----------------------------
 * Conversation list rendering
 * ----------------------------- */
function renderConversationList(conversations) {
    conversationList.innerHTML = '';

    if (!Array.isArray(conversations) || conversations.length === 0) {
        conversationList.innerHTML = `
            <div class="conversation-empty">
                저장된 대화가 여기에 표시됩니다.
            </div>
        `;
        return;
    }

    conversations.forEach((conv) => {
        const item = document.createElement('div');
        item.className = `conversation-item${conv.conversation_id === currentConversationId ? ' is-active' : ''}`;

        const isEditing = editingConversationId === conv.conversation_id;

        if (isEditing) {
            const editWrap = document.createElement('div');
            editWrap.className = 'conversation-item__edit';

            const inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.className = 'conversation-edit-input';
            inputEl.value = conv.title || '새 채팅';
            inputEl.maxLength = 60;

            const actions = document.createElement('div');
            actions.className = 'conversation-edit-actions';

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'conversation-inline-btn';
            cancelBtn.textContent = '취소';

            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingConversationId = '';
                refreshConversationList();
            });

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'conversation-inline-btn conversation-inline-btn--save';
            saveBtn.textContent = '저장';

            const submitEdit = async () => {
                const trimmed = inputEl.value.trim();
                if (!trimmed) {
                    alert('제목은 비워둘 수 없습니다.');
                    inputEl.focus();
                    return;
                }

                try {
                    await updateConversationTitleApi(conv.conversation_id, trimmed);
                    editingConversationId = '';
                    await refreshConversationList();
                } catch (error) {
                    console.error(error);
                    alert('제목을 수정하지 못했습니다.');
                }
            };

            saveBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await submitEdit();
            });

            inputEl.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    await submitEdit();
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    editingConversationId = '';
                    await refreshConversationList();
                }
            });

            actions.appendChild(cancelBtn);
            actions.appendChild(saveBtn);

            editWrap.appendChild(inputEl);
            editWrap.appendChild(actions);

            item.appendChild(editWrap);
            conversationList.appendChild(item);

            setTimeout(() => {
                inputEl.focus();
                inputEl.select();
            }, 0);

            return;
        }

        const contentBtn = document.createElement('button');
        contentBtn.type = 'button';
        contentBtn.className = 'conversation-item__content';
        contentBtn.style.all = 'unset';
        contentBtn.style.cursor = 'pointer';
        contentBtn.style.display = 'block';
        contentBtn.style.minWidth = '0';
        contentBtn.style.flex = '1 1 auto';

        contentBtn.innerHTML = `
            <div class="conversation-item__title">${escapeHtml(conv.title || '새 채팅')}</div>
            <div class="conversation-item__meta">${formatConversationDate(conv.updated_at)}</div>
        `;

        contentBtn.addEventListener('click', async () => {
            if (currentConversationId === conv.conversation_id) {
                if (window.innerWidth <= 960) {
                    closeConversationPanel();
                }
                return;
            }

            currentConversationId = conv.conversation_id;
            localStorage.setItem('current_conversation_id', currentConversationId);

            await loadCurrentConversation();
            await refreshConversationList();

            if (window.innerWidth <= 960) {
                closeConversationPanel();
            }
        });

        const actions = document.createElement('div');
        actions.className = 'conversation-item__actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'conversation-action-btn';
        editBtn.setAttribute('aria-label', '제목 수정');
        editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';

        editBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            editingConversationId = conv.conversation_id;
            await refreshConversationList();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'conversation-action-btn conversation-action-btn--danger';
        deleteBtn.setAttribute('aria-label', '대화 삭제');
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteModal(conv);
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        item.appendChild(contentBtn);
        item.appendChild(actions);

        conversationList.appendChild(item);
    });
}

/* -----------------------------
 * Message rendering
 * ----------------------------- */
function createTypingIndicator() {
    const wrap = document.createElement('div');
    wrap.className = 'typing';
    wrap.innerHTML = '<span></span><span></span><span></span>';
    return wrap;
}

function appendMessage(sender, text, isLoading = false) {
    const id = `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const isUser = sender === 'user';

    const row = document.createElement('div');
    row.className = `message-row ${isUser ? 'message-row--user' : 'message-row--bot'} fade-in`;
    row.id = id;

    const avatar = document.createElement('div');
    avatar.className = `avatar ${isUser ? 'avatar--user' : 'avatar--bot'}`;
    avatar.textContent = isUser ? 'ME' : 'AI';

    const wrap = document.createElement('div');
    wrap.className = 'bubble-wrap';

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = isUser ? `나 · ${getTimeLabel()}` : `정책 상담 AI · ${getTimeLabel()}`;

    const bubble = document.createElement('div');
    bubble.className = `bubble ${isUser ? 'bubble--user' : 'bubble--bot'}${isLoading ? ' loading' : ''}`;

    if (isLoading) {
        bubble.appendChild(createTypingIndicator());
    } else {
        bubble.textContent = text;
    }

    wrap.appendChild(meta);
    wrap.appendChild(bubble);

    if (isUser) {
        row.appendChild(wrap);
        row.appendChild(avatar);
    } else {
        row.appendChild(avatar);
        row.appendChild(wrap);
    }

    messages.appendChild(row);
    scrollToBottom();
    return id;
}

function clearChatMessages() {
    messages.innerHTML = '';
}

function appendStoredMessage(role, text) {
    const id = appendMessage(role, '', false);
    const row = document.getElementById(id);
    if (!row) return;

    const bubble = row.querySelector('.bubble');
    if (!bubble) return;

    bubble.innerHTML = '';

    if (role === 'assistant') {
        const content = document.createElement('div');
        content.className = 'markdown-body';
        content.innerHTML = renderMarkdown(text || '');
        bubble.appendChild(content);

        const analysisData = metadata
            ? {
                retrieval_debug: metadata.retrieval_debug || null,
                xai: metadata.xai || null,
            }
            : null;

        const originalMessage = metadata?.original_message || '';

        const stack = document.createElement('div');
        stack.className = 'analysis-stack';

        const heatmapButton = buildHeatmapButton(originalMessage, analysisData);
        if (heatmapButton) {
            stack.appendChild(heatmapButton);
        }

        if (stack.children.length > 0) {
            bubble.appendChild(stack);
        }
    } else {
        bubble.textContent = text || '';
    }
}

async function loadCurrentConversation() {
    const conversationId = await ensureConversationReady();

    let conversation;
    try {
        conversation = await fetchConversationDetail(conversationId);
        applyCurrentConversationTitleFromConversation(conversation);
    } catch (error) {
        console.warn('대화방 로드 실패, 새 대화방으로 복구합니다:', error);
        localStorage.removeItem('current_conversation_id');
        currentConversationId = '';
        const recoveredConversationId = await ensureConversationReady();
        conversation = await fetchConversationDetail(recoveredConversationId);
    }

    clearChatMessages();

    const messagesData = Array.isArray(conversation.messages) ? conversation.messages : [];

    if (messagesData.length === 0) {
        showIntroCard();
        appendStoredMessage('assistant', DEFAULT_ASSISTANT_MESSAGE);
        return;
    }

    hideIntroCard();

    messagesData.forEach((msg) => {
        const sender = msg.role === 'assistant' ? 'assistant' : 'user';
        appendStoredMessage(sender, msg.content || '', msg.metadata || null);
    });

    scrollToBottom();
}

/* -----------------------------
 * Captum / heatmap rendering
 * ----------------------------- */
function getWordHighlightColor(score, rank) {
    if (rank === 0) return 'rgba(255, 230, 120, 0.72)';  // 1등: 노란색
    if (rank === 1) return 'rgba(255, 255, 255, 0.34)';  // 2등: 흰색 계열
    if (rank === 2) return 'rgba(219, 234, 254, 0.42)';  // 3등: 연한 파란색
    return 'transparent';
}

function buildUserHighlightedHtml(originalMessage, captumResult) {
    if (!captumResult || !Array.isArray(captumResult.word_scores)) {
        return `<div>${escapeHtml(originalMessage)}</div>`;
    }

    const words = [...captumResult.word_scores]
        .filter((w) => w && typeof w.start === 'number' && typeof w.end === 'number')
        .sort((a, b) => a.start - b.start);

    if (words.length === 0) {
        return `<div>${escapeHtml(originalMessage)}</div>`;
    }

    const ranked = [...words]
        .map((w, idx) => ({ ...w, originalIndex: idx }))
        .sort((a, b) => b.score - a.score);

    const rankMap = new Map();
    ranked.forEach((w, i) => {
        rankMap.set(`${w.start}-${w.end}`, i);
    });

    let html = '<div class="user-highlight">';
    let cursor = 0;

    for (const w of words) {
        const plainText = originalMessage.slice(cursor, w.start);
        if (plainText) {
            html += escapeHtml(plainText);
        }

        const key = `${w.start}-${w.end}`;
        const rank = rankMap.get(key) ?? 999;
        const bg = getWordHighlightColor(w.score, rank);
        const wordText = originalMessage.slice(w.start, w.end);

        if (bg === 'transparent') {
            html += escapeHtml(wordText);
        } else {
            html += `<span class="user-highlight-word" style="background:${bg}" title="score=${w.score.toFixed(4)}">${escapeHtml(wordText)}</span>`;
        }

        cursor = w.end;
    }

    if (cursor < originalMessage.length) {
        html += escapeHtml(originalMessage.slice(cursor));
    }

    html += '</div>';
    html += '<div class="user-highlight-note">Captum 기준 상위 핵심어만 색으로 표시했습니다.</div>';

    return html;
}

function buildWordScoresFromQueryItems(originalMessage, queryItems, topN = 3) {
    if (!originalMessage || !Array.isArray(queryItems)) {
        return [];
    }

    const sorted = [...queryItems]
        .filter((item) => item?.label && Number(item.percent) > 0)
        .sort((a, b) => Number(b.percent) - Number(a.percent))
        .slice(0, topN);

    const usedRanges = [];

    return sorted
        .map((item) => {
            const word = String(item.label || '').trim();
            if (!word) return null;

            let start = originalMessage.indexOf(word);

            // 같은 단어가 여러 번 나오거나, 이미 칠한 범위와 겹치는 경우 다음 위치를 찾는다.
            while (
                start >= 0 &&
                usedRanges.some((range) => start < range.end && start + word.length > range.start)
            ) {
                start = originalMessage.indexOf(word, start + word.length);
            }

            // 원문에서 단어를 찾지 못하면 색칠 대상에서 제외한다.
            if (start < 0) return null;

            const end = start + word.length;
            usedRanges.push({ start, end });

            return {
                start,
                end,
                score: Number(item.percent) || 0,
                label: word,
            };
        })
        .filter(Boolean);
}

function updateUserMessageWithCaptum(id, originalMessage, captumResult) {
    const row = document.getElementById(id);
    if (!row) return;

    const bubble = row.querySelector('.bubble');
    if (!bubble) return;

    bubble.innerHTML = buildUserHighlightedHtml(originalMessage, captumResult);
    scrollToBottom();
}

function getContributionWidth(percent) {
    const value = Number(percent) || 0;
    if (value <= 0) return 0;

    // 너무 작은 양수도 화면에서는 최소한 보이게 처리
    return Math.max(value, 4);
}

function getScoreLabel(item) {
    const percent = Number(item?.percent) || 0;

    if (percent <= 0) {
        return '낮은 영향';
    }

    return `${percent.toFixed(1)}%`;
}

function getSafeNumberText(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return '-';
    }

    return number.toFixed(4);
}

function normalizeDebugItems(items) {
    if (!Array.isArray(items)) return [];

    return items
        .filter((item) => item && typeof item === 'object')
        .slice(0, 5);
}

function getDebugTitle(item, fallbackIndex) {
    return (
        item.policy_name ||
        item.title ||
        item.name ||
        item.document_title ||
        `문서 ${fallbackIndex + 1}`
    );
}

function getDebugPreview(item) {
    return (
        item.content_preview ||
        item.text_preview ||
        item.preview ||
        item.text ||
        item.content ||
        ''
    );
}

function buildInfoToggleHtml(targetId) {
    return `
        <button
            type="button"
            class="xai-info-btn"
            data-info-target="${targetId}"
            aria-expanded="false"
            title="설명 보기"
        >
            ?
        </button>
    `;
}

function buildRerankerInfoHtml(id) {
    return `
        <div id="${id}" class="xai-info-box" hidden>
            <strong>Reranker 점수</strong>는 질문과 문서의 관련성을 평가해
            검색 결과 순서를 다시 정렬한 점수입니다.
            즉, 답변 생성 전에 어떤 문서를 우선적으로 참고할지 결정하는
            <strong>검색 단계의 설명</strong>입니다.
        </div>
    `;
}

function buildCaptumInfoHtml(id) {
    return `
        <div id="${id}" class="xai-info-box" hidden>
            <strong>Captum 기여도</strong>는 최종 답변을 기준으로,
            각 문서를 제거했을 때 답변 가능도가 얼마나 달라지는지 분석한 값입니다.
            즉, 생성된 답변이 어떤 문서에 더 많이 의존했는지를 보여주는
            <strong>답변 단계의 설명</strong>입니다.
        </div>
    `;
}

function buildQueryCaptumInfoHtml(id) {
    return `
        <div id="${id}" class="xai-info-box" hidden>
            <strong>질문 핵심어 기여도</strong>는 사용자 질문에서 조사·어미 등
            의미 기여가 낮은 요소를 제외하고, 핵심 단어를 기준으로
            답변 생성에 미친 영향을 보여주는 값입니다.
        </div>
    `;
}

function buildRetrievalTableHtml(title, items) {
    const safeItems = normalizeDebugItems(items);

    if (safeItems.length === 0) {
        return `
            <div class="xai-empty">
                표시할 ${escapeHtml(title)} 결과가 없습니다.
            </div>
        `;
    }

    return `
        <div class="xai-debug-table-wrap">
            <table class="xai-debug-table">
                <thead>
                    <tr>
                        <th>순위</th>
                        <th>정책/문서</th>
                        <th>Qdrant</th>
                        <th>Reranker</th>
                    </tr>
                </thead>
                <tbody>
                    ${safeItems.map((item, index) => {
                        const titleText = getDebugTitle(item, index);
                        const preview = getDebugPreview(item);
                        const qdrantScore = item.qdrant_score ?? item.score ?? item.adjusted_score;
                        const rerankerScore = item.reranker_score ?? item.rerank_score;

                        return `
                            <tr>
                                <td>${escapeHtml(item.rank || index + 1)}</td>
                                <td>
                                    <div class="xai-doc-title">${escapeHtml(titleText)}</div>
                                    ${preview ? `<div class="xai-doc-preview">${escapeHtml(preview)}</div>` : ''}
                                </td>
                                <td>${escapeHtml(getSafeNumberText(qdrantScore))}</td>
                                <td>${escapeHtml(getSafeNumberText(rerankerScore))}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function buildRetrievalDebugHtml(retrievalDebug) {
    const beforeItems = retrievalDebug?.before_rerank || [];
    const afterItems = retrievalDebug?.after_rerank || [];

    return `
        <section class="xai-section">
            <div class="xai-section__header">
                <h4>1. RAG / Reranker 검색 결과</h4>
                ${buildInfoToggleHtml('reranker-info')}
            </div>
            ${buildRerankerInfoHtml('reranker-info')}

            <div class="xai-subsection">
                <div class="xai-subtitle">Rerank 전 Top 5</div>
                ${buildRetrievalTableHtml('Rerank 전', beforeItems)}
            </div>

            <div class="xai-subsection">
                <div class="xai-subtitle">Rerank 후 Top 5</div>
                ${buildRetrievalTableHtml('Rerank 후', afterItems)}
            </div>
        </section>
    `;
}

function buildContributionBarHtml(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return `
            <div class="xai-empty">
                Captum 결과가 없습니다.
            </div>
        `;
    }

    const sorted = [...items].sort((a, b) => {
        const bPercent = Number(b?.percent) || 0;
        const aPercent = Number(a?.percent) || 0;
        return bPercent - aPercent;
    });

    return `
        <div class="bar-chart xai-contribution-chart">
            ${sorted.map((item) => {
                const label = item.label || '항목';
                const percent = Number(item.percent) || 0;
                const width = getContributionWidth(percent);
                const scoreLabel = getScoreLabel(item);

                return `
                    <div class="bar-row xai-contribution-row">
                        <div class="bar-row__label" title="${escapeHtml(label)}">
                            ${escapeHtml(label)}
                        </div>
                        <div class="bar-row__track">
                            <div class="bar-row__fill" style="width:${width}%"></div>
                        </div>
                        <div class="bar-row__value">${escapeHtml(scoreLabel)}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function buildCaptumHtml(xai) {
    const items = xai?.items || [];
    const summary = xai?.summary || 'Captum 분석 요약이 없습니다.';

    return `
        <section class="xai-section">
            <div class="xai-section__header">
                <h4>2. Captum 문서 기여도</h4>
                ${buildInfoToggleHtml('captum-info')}
            </div>
            ${buildCaptumInfoHtml('captum-info')}

            <div class="xai-summary">
                ${escapeHtml(summary)}
            </div>

            ${buildContributionBarHtml(items)}
        </section>
    `;
}

function buildQueryCaptumHtml(xai) {
    const queryItems = xai?.query_items || [];
    const summary = xai?.query_summary || '질문 핵심어 분석 요약이 없습니다.';

    if (!Array.isArray(queryItems) || queryItems.length === 0) {
        return '';
    }

    return `
        <section class="xai-section">
            <div class="xai-section__header">
                <h4>3. Captum 질문 핵심어 기여도</h4>
                ${buildInfoToggleHtml('query-captum-info')}
            </div>
            ${buildQueryCaptumInfoHtml('query-captum-info')}

            <div class="xai-summary">
                ${escapeHtml(summary)}
            </div>

            ${buildContributionBarHtml(queryItems)}
        </section>
    `;
}

function buildHeatmapModalHtml(originalMessage, analysisData) {
    const retrievalDebug = analysisData?.retrieval_debug || {};
    const xai = analysisData?.xai || null;

    return `
        <div class="heatmap-panel xai-panel">
            <section class="xai-section">
                <h4>사용자 질문</h4>
                <div class="heatmap-question">${escapeHtml(originalMessage)}</div>
            </section>

            ${buildRetrievalDebugHtml(retrievalDebug)}
            ${buildCaptumHtml(xai)}
            ${buildQueryCaptumHtml(xai)}
            
        </div>
    `;
}

function bindXaiInfoButtons() {
    const buttons = heatmapContent.querySelectorAll('.xai-info-btn');

    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.infoTarget;
            if (!targetId) return;

            const target = heatmapContent.querySelector(`#${CSS.escape(targetId)}`);
            if (!target) return;

            const willOpen = target.hidden;
            target.hidden = !willOpen;
            button.setAttribute('aria-expanded', String(willOpen));
        });
    });
}

function openHeatmapModal(originalMessage, analysisData) {
    closeDeleteModal();
    heatmapContent.innerHTML = buildHeatmapModalHtml(originalMessage, analysisData);
    bindXaiInfoButtons();
    heatmapModal.hidden = false;
    document.body.classList.add('sidebar-open');
}

function closeHeatmapModal() {
    heatmapModal.hidden = true;
    heatmapContent.innerHTML = '';
    unlockOverlayScrollIfNeeded();
}

function buildHeatmapButton(originalMessage, analysisData) {
    const hasRetrievalDebug = Boolean(
        analysisData?.retrieval_debug &&
        (
            Array.isArray(analysisData.retrieval_debug.before_rerank) ||
            Array.isArray(analysisData.retrieval_debug.after_rerank)
        )
    );

    const hasXaiItems = Array.isArray(analysisData?.xai?.items) &&
    analysisData.xai.items.length > 0;

    const hasQueryItems = Array.isArray(analysisData?.xai?.query_items) &&
        analysisData.xai.query_items.length > 0;

    if (!hasRetrievalDebug && !hasXaiItems && !hasQueryItems) {
        return null;
    }

    const wrap = document.createElement('div');
    wrap.className = 'xai-action-row';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'heatmap-open-btn';
    button.innerHTML = '<i class="fa-solid fa-chart-simple"></i><span>답변 근거 분석 보기</span>';

    // 버튼 클릭 시 서버에 새로 요청하지 않는다.
    // 이미 /chat 응답에 포함되어 있던 retrieval_debug와 xai를 모달에 표시만 한다.
    button.addEventListener('click', () => {
        openHeatmapModal(originalMessage, analysisData);
    });

    wrap.appendChild(button);
    return wrap;
}

heatmapClose?.addEventListener('click', closeHeatmapModal);
heatmapBackdrop?.addEventListener('click', closeHeatmapModal);
deleteClose?.addEventListener('click', closeDeleteModal);
deleteBackdrop?.addEventListener('click', closeDeleteModal);
deleteCancel?.addEventListener('click', closeDeleteModal);

deleteConfirm?.addEventListener('click', async () => {
    if (!pendingDeleteConversation) return;

    try {
        await deleteConversationAndRecover(pendingDeleteConversation.conversation_id);

        if (window.innerWidth <= 960) {
            closeConversationPanel();
        }

        closeDeleteModal();
    } catch (error) {
        console.error(error);
        alert('대화를 삭제하지 못했습니다.');
    }
});



function updateMessage(id, text, originalMessage = '', analysisData = null) {
    const row = document.getElementById(id);
    if (!row) return;

    const bubble = row.querySelector('.bubble');
    if (!bubble) return;

    bubble.classList.remove('loading');
    bubble.innerHTML = '';

    const textNode = document.createElement('div');
    textNode.className = 'markdown-body';
    textNode.innerHTML = renderMarkdown(text);
    bubble.appendChild(textNode);

    const stack = document.createElement('div');
    stack.className = 'analysis-stack';

    const heatmapButton = buildHeatmapButton(originalMessage, analysisData);
    if (heatmapButton) {
        stack.appendChild(heatmapButton);
    }

    if (stack.children.length > 0) {
        bubble.appendChild(stack);
    }

    scrollToBottom();
}

/* -----------------------------
 * Chat sending
 * ----------------------------- */
async function sendMessage(message, userMessageId) {
    const loadingId = appendMessage('bot', '', true);

    try {
        const chatData = await callChatAPI(message);
        const answer = chatData.answer || '응답을 생성하지 못했습니다.';
        const xaiData = chatData.xai || null;
        const retrievalDebug = chatData.retrieval_debug || null;

        // 개발자 확인용 로그
        // F12 Console에서 원본 Reranker/Captum 값을 확인할 수 있다.
        console.group('XAI 통합 응답');
        console.log('전체 응답:', chatData);
        console.log('RAG / Reranker 결과:', retrievalDebug);
        console.log('Captum 문서 기여도:', xaiData?.items || []);
        console.log('Captum 질문 핵심어 기여도:', xaiData?.query_items || []);
        console.log('Captum 원본값:', xaiData?.raw || {});
        console.groupEnd();

        // 질문 토큰 색칠
        const queryWordScores = buildWordScoresFromQueryItems(
            message,
            xaiData?.query_items || [],
            3
        );

        if (queryWordScores.length > 0) {
            updateUserMessageWithCaptum(
                userMessageId,
                message,
                { word_scores: queryWordScores }
            );
        }

        updateMessage(
            loadingId,
            answer,
            message,
            {
                xai: xaiData,
                retrieval_debug: retrievalDebug
            }
        );

        await refreshConversationList();
    } catch (error) {
        updateMessage(
            loadingId,
            '서버 응답 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        );
        console.error(error);
    } finally {
        sendBtn.disabled = false;
        input.disabled = false;
        input.focus();
        autoResizeTextarea();

        setTimeout(() => {
            scrollToBottom();
        }, 100);
    }
}

/* -----------------------------
 * Form / button events
 * ----------------------------- */
input.addEventListener('input', autoResizeTextarea);

input.addEventListener('focus', () => {
    setAppHeight();
    setTimeout(() => {
        scrollToBottom();
    }, 250);
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
    }

    if (!deleteModal.hidden) {
    closeDeleteModal();
    return;
}
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const message = input.value.trim();
    if (!message) return;

    const userMessageId = appendMessage('user', message);
    input.value = '';
    autoResizeTextarea();
    hideIntroCard();

    sendBtn.disabled = true;
    input.disabled = true;

    await sendMessage(message, userMessageId);
});

newChatBtn?.addEventListener('click', async () => {
    try {
        await createAndSwitchConversation();
    } catch (error) {
        console.error(error);
        alert('새 대화를 시작하지 못했습니다.');
    }
});

resetBtn.addEventListener('click', async () => {
    const ok = confirm('새 대화를 시작할까요?');
    if (!ok) return;

    try {
        await createAndSwitchConversation();
    } catch (error) {
        console.error(error);
        alert('새 대화를 시작하지 못했습니다.');
    }
});

/* -----------------------------
 * Example chips
 * ----------------------------- */
exampleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
        const chipText = chip.textContent.trim();
        let template = '';

        switch (chipText) {
            case '자격증 지원':
                template = `자격증 지원 프로그램이 궁금해.\n지역:\n나이:\n취업 여부:`;
                break;
            case '월세 지원':
                template = `월세 지원 정책에 대해 알려줘.\n지역:\n나이:\n소득수준:`;
                break;
            case '취업 지원':
                template = `취업 지원 프로그램에 대해 알려줘.\n관심 직무:\n지역:\n나이:\n희망 기업 규모:`;
                break;
            case '창업 지원':
                template = `창업 지원금에 대해 궁금해.\n나이:\n희망 창업 분야:\n사업자 등록 여부:`;
                break;
            case '자산 형성':
                template = `자산 형성 지원 정책이 궁금해.\n현재 직업:\n월 평균 소득:\n거주 지역:\n중위소득 비율:`;
                break;
            default:
                template = `${chipText} 관련 정책 알려줘.`;
        }

        input.value = template;
        autoResizeTextarea();
        input.focus();

        if (window.innerWidth <= 960) {
            closeSidebar();
            closeConversationPanel();
        }

        setTimeout(() => {
            scrollToBottom(true);
        }, 120);
    });
});

/* -----------------------------
 * Global key handling
 * ----------------------------- */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!heatmapModal.hidden) {
            closeHeatmapModal();
            return;
        }

        if (sidebar.classList.contains('is-open')) {
            closeSidebar();
        }

        if (conversationPanel.classList.contains('is-open')) {
            closeConversationPanel();
        }
    }
});

/* -----------------------------
 * Bootstrap
 * ----------------------------- */
async function bootstrapApp() {
    setCurrentChatTitle(DEFAULT_TOPBAR_TITLE);
    try {
        await ensureConversationReady();
        await refreshConversationList();
        await loadCurrentConversation();
    } catch (error) {
        console.error(error);
    } finally {
        autoResizeTextarea();
    }
}

bootstrapApp();