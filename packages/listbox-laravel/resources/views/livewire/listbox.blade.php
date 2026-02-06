@php
    $rootAttributes = [
        'data-affino-listbox-root' => $listboxId,
        'data-affino-listbox-mode' => $mode,
        'data-affino-listbox-loop' => $loop ? 'true' : 'false',
        'data-affino-listbox-placeholder' => $placeholder,
        'data-affino-listbox-state' => 'closed',
    ];

    if ($model) {
        $rootAttributes['data-affino-listbox-model'] = $model;
    }

    if ($disabled) {
        $rootAttributes['data-affino-listbox-disabled'] = 'true';
    }
@endphp

<div {{ $attributes->merge($rootAttributes)->class('affino-listbox') }}>
    <div class="affino-listbox__trigger" data-affino-listbox-trigger>
        @isset($trigger)
            {{ $trigger }}
        @else
            <button type="button" class="affino-listbox__button" data-affino-listbox-trigger-control @if ($label) aria-label="{{ $label }}" @endif>
                @if ($label)
                    <span class="affino-listbox__button-label">{{ $label }}</span>
                @endif
                <span class="affino-listbox__value" data-affino-listbox-display>{{ $display ?? $placeholder }}</span>
                <span class="affino-listbox__icon" aria-hidden="true">&#9662;</span>
            </button>
        @endisset
    </div>

    <div
        wire:ignore.self
        data-affino-listbox-surface
        role="listbox"
        @if ($mode === 'multiple') aria-multiselectable="true" @endif
        data-state="closed"
        hidden
    >
        {{ $slot }}
    </div>

    <input
        type="hidden"
        data-affino-listbox-input
        value="{{ $initialValue }}"
        @if ($name) name="{{ $name }}" @endif
    >
</div>
