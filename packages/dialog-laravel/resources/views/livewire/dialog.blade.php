@props([
    'id' => null,
    'modal' => true,
    'closeOnBackdrop' => true,
    'closeOnEscape' => true,
    'lockScroll' => true,
    'returnFocus' => true,
    'pinned' => false,
    'defaultOpen' => false,
    'overlayKind' => 'dialog',
    'closeStrategy' => 'blocking',
    'teleportTarget' => null,
    'stateSync' => false,
    'pendingMessage' => null,
    'maxPendingAttempts' => null,
    'ownerId' => null,
    'labelledBy' => null,
    'ariaLabel' => null,
    'surfaceRole' => 'dialog',
    'descriptionId' => null,
])

@php
    $dialogId = $dialogId ?? $id ?? (string) \Illuminate\Support\Str::uuid();
    $closeStrategy = in_array($closeStrategy, ['blocking', 'optimistic'], true) ? $closeStrategy : 'blocking';

    $rootAttributes = [
        'data-affino-dialog-root' => $dialogId,
        'id' => $dialogId,
        'data-affino-dialog-state' => 'closed',
        'data-affino-dialog-modal' => $modal ? 'true' : 'false',
        'data-affino-dialog-close-backdrop' => $closeOnBackdrop ? 'true' : 'false',
        'data-affino-dialog-close-escape' => $closeOnEscape ? 'true' : 'false',
        'data-affino-dialog-lock-scroll' => $lockScroll ? 'true' : 'false',
        'data-affino-dialog-return-focus' => $returnFocus ? 'true' : 'false',
        'data-affino-dialog-pinned' => $pinned ? 'true' : 'false',
        'data-affino-dialog-default-open' => $defaultOpen ? 'true' : 'false',
        'data-affino-dialog-overlay-kind' => $overlayKind,
        'data-affino-dialog-close-strategy' => $closeStrategy,
        'data-affino-dialog-state-sync' => $stateSync ? 'true' : 'false',
    ];

    if ($teleportTarget) {
        $rootAttributes['data-affino-dialog-teleport'] = $teleportTarget;
    }

    if ($pendingMessage) {
        $rootAttributes['data-affino-dialog-pending-message'] = $pendingMessage;
    }

    if ($maxPendingAttempts !== null) {
        $rootAttributes['data-affino-dialog-max-pending'] = (string) $maxPendingAttempts;
    }

    if ($ownerId) {
        $rootAttributes['data-affino-dialog-owner-id'] = $ownerId;
    }
@endphp

<div {{ $attributes->merge($rootAttributes)->class('affino-dialog') }}>
    @isset($trigger)
        <div data-affino-dialog-trigger>
            {{ $trigger }}
        </div>
    @endisset

    <div data-affino-dialog-overlay data-affino-dialog-owner="{{ $dialogId }}" data-state="closed" hidden>
        <div
            data-affino-dialog-surface
            role="{{ $surfaceRole }}"
            tabindex="-1"
            @if ($modal) aria-modal="true" @endif
            @if ($labelledBy) aria-labelledby="{{ $labelledBy }}" @endif
            @if ($ariaLabel) aria-label="{{ $ariaLabel }}" @endif
            @if ($descriptionId) aria-describedby="{{ $descriptionId }}" @endif
        >
            @if ($modal)
                <span class="affino-dialog__sentinel focus-sentinel" data-affino-dialog-sentinel="start" tabindex="0"></span>
            @endif

            {{ $slot }}

            @if ($modal)
                <span class="affino-dialog__sentinel focus-sentinel" data-affino-dialog-sentinel="end" tabindex="0"></span>
            @endif
        </div>
    </div>
</div>
