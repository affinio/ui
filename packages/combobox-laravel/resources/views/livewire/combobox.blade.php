@php
    $rootAttributes = [
        'data-affino-combobox-root' => $comboboxId,
        'data-affino-combobox-mode' => $mode,
        'data-affino-combobox-loop' => $loop ? 'true' : 'false',
        'data-affino-combobox-placeholder' => $placeholder,
        'data-affino-combobox-state' => 'false',
        'data-affino-combobox-open-pointer' => $openOnPointerDown ? 'true' : 'false',
    ];

    if ($model) {
        $rootAttributes['data-affino-combobox-model'] = $model;
    }

    if ($disabled) {
        $rootAttributes['data-affino-combobox-disabled'] = 'true';
    }

    if ($pinned) {
        $rootAttributes['data-affino-combobox-pinned'] = 'true';
    }
@endphp

<div {{ $attributes->merge($rootAttributes)->class('affino-combobox') }}>
    @if ($label)
        <label
            id="{{ $comboboxId }}-label"
            class="affino-combobox__label"
            for="{{ $comboboxId }}-input"
        >
            {{ $label }}
        </label>
    @endif

    <div class="affino-combobox__field">
        <input
            type="text"
            id="{{ $comboboxId }}-input"
            class="affino-combobox__input"
            data-affino-combobox-input
            value="{{ $display ?? '' }}"
            placeholder="{{ $placeholder }}"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            @if ($label) aria-labelledby="{{ $comboboxId }}-label" @endif
            @if ($disabled) disabled @endif
        >
    </div>

    <div
        data-affino-combobox-surface
        role="listbox"
        @if ($mode === 'multiple') aria-multiselectable="true" @endif
        @if ($label) aria-labelledby="{{ $comboboxId }}-label" @endif
        data-state="closed"
        hidden
    >
        {{ $slot }}
    </div>

    <input
        type="hidden"
        data-affino-combobox-value
        value="{{ $initialValue }}"
        @if ($name) name="{{ $name }}" @endif
    >
</div>
