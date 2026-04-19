using Microsoft.AspNetCore.Components;

namespace SteelPans.WebApp.Components.Elements;

public partial class ModalPopup
{

    [Parameter]
    public string Title { get; set; } = string.Empty;

    [Parameter]
    public string? Subtitle { get; set; }

    [Parameter]
    public string TitleId { get; set; } = $"modal-popup-title-{Guid.NewGuid():N}";

    [Parameter]
    public bool CloseOnBackdropClick { get; set; } = true;

    [Parameter]
    public bool ShowCloseButton { get; set; } = true;

    [Parameter]
    public string BackdropClass { get; set; } = "modal-popup__backdrop";

    [Parameter]
    public string ModalClass { get; set; } = "modal-popup";

    [Parameter]
    public string CardClass { get; set; } = "modal-popup__card";

    [Parameter]
    public string HeaderClass { get; set; } = "modal-popup__header";

    [Parameter]
    public string TitleClass { get; set; } = "modal-popup__title";

    [Parameter]
    public string SubtitleClass { get; set; } = "modal-popup__subtitle";

    [Parameter]
    public string BodyClass { get; set; } = "modal-popup__body";

    [Parameter]
    public string ActionsClass { get; set; } = "modal-popup__actions";

    [Parameter]
    public RenderFragment? ChildContent { get; set; }

    [Parameter]
    public RenderFragment? Actions { get; set; }

    [Parameter]
    public EventCallback OnClose { get; set; }

    private bool isOpen_;
    public async Task OpenModal()
    {
        isOpen_ = true;
        await OnOpenAsync();
    }

    public override async Task OnCloseAsync()
    {
        isOpen_ = false;
        await OnClose.InvokeAsync();
    }

    private async Task OnBackdropClickedAsync()
    {
        if (!CloseOnBackdropClick)
            return;

        await OnCloseAsync();
    }
}