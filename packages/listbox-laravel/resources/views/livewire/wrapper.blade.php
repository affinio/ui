@php
    $selectedValues = array_map('strval', (array) ($selected ?? []));
@endphp

<x-affino-listbox
    :listbox-id="$listboxId"
    :label="$label"
    :placeholder="$placeholder"
    :mode="$mode"
    :loop="$loop"
    :model="$model"
    :name="$name"
    :disabled="$disabled"
    :selected="$selected"
    :display="$display"
>
    @foreach ($options as $option)
        @php
            $value = (string) ($option['value'] ?? '');
            $optionLabel = $option['label'] ?? $value;
            $isDisabled = (bool) ($option['disabled'] ?? false);
            $isSelected = in_array($value, $selectedValues, true);
        @endphp
        <x-affino-listbox-option
            :value="$value"
            :label="$optionLabel"
            :disabled="$isDisabled"
            :selected="$isSelected"
        >
            {{ $optionLabel }}
        </x-affino-listbox-option>
    @endforeach
</x-affino-listbox>
