@props([
    'value',
    'label' => null,
    'disabled' => false,
    'selected' => false,
])

@php
    $textLabel = $label ?? trim(preg_replace('/\s+/', ' ', strip_tags($slot)));
    if ($textLabel === '') {
        $textLabel = (string) $value;
    }

    $optionAttributes = [
        'data-affino-listbox-option' => 'true',
        'data-affino-listbox-value' => $value,
        'data-affino-listbox-label' => $textLabel,
        'role' => 'option',
        'tabindex' => '-1',
        'aria-selected' => $selected ? 'true' : 'false',
    ];

    if ($selected) {
        $optionAttributes['data-affino-listbox-option-selected'] = 'true';
    }

    if ($disabled) {
        $optionAttributes['data-affino-listbox-disabled'] = 'true';
        $optionAttributes['aria-disabled'] = 'true';
    }
@endphp

<div {{ $attributes->merge($optionAttributes)->class([
        'affino-combobox-option',
        'is-disabled' => $disabled,
        'is-selected' => $selected,
    ]) }}>
    {{ $slot }}
</div>
