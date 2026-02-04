@props([
    'dialogId',
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
    'pendingMessage' => null,
    'maxPendingAttempts' => null,
    'labelledBy' => null,
    'ariaLabel' => null,
    'surfaceRole' => 'dialog',
    'descriptionId' => null,
])

@php
    $rootAttributes = [
        'data-affino-dialog-root' => $dialogId,
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
@endphp

<div {{ $attributes->merge($rootAttributes)->class('affino-dialog') }}>
    @isset($trigger)
        <div data-affino-dialog-trigger>
            {{ $trigger }}
        </div>
    @endisset

    <div data-affino-dialog-overlay data-state="closed" hidden>
        <div
            data-affino-dialog-surface
            role="{{ $surfaceRole }}"
            tabindex="-1"
            @if ($modal) aria-modal="true" @endif
            @if ($labelledBy) aria-labelledby="{{ $labelledBy }}" @endif
            @if ($ariaLabel) aria-label="{{ $ariaLabel }}" @endif
            @if ($descriptionId) aria-describedby="{{ $descriptionId }}" @endif
        >
            <span class="affino-dialog__sentinel" data-affino-dialog-sentinel="start" tabindex="0"></span>

            {{ $slot }}

            <span class="affino-dialog__sentinel" data-affino-dialog-sentinel="end" tabindex="0"></span>
        </div>
    </div>
</div>
