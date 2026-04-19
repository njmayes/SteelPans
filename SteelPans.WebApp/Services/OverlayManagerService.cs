namespace SteelPans.WebApp.Services;

using Microsoft.AspNetCore.Components;

public abstract class OverlayComponentBase : ComponentBase, IDisposable
{
    [Inject]
    protected OverlayManagerService Registry { get; set; } = default!;

    protected override void OnInitialized()
    {
        base.OnInitialized();
        Registry.Register(this);
    }

    public virtual void Dispose()
    {
        Registry.Unregister(this);
    }

    public async Task OnOpenAsync()
    {
        await Registry.OnOpenComponent(this);
    }

    public abstract Task OnCloseAsync();
}

public class OverlayManagerService
{
    private readonly HashSet<OverlayComponentBase> components_ = [];

    public IReadOnlyCollection<OverlayComponentBase> Components => components_;

    public void Register(OverlayComponentBase component)
    {
        components_.Add(component);
    }

    public void Unregister(OverlayComponentBase component)
    {
        components_.Remove(component);
    }

    public async Task OnOpenComponent(OverlayComponentBase component)
    {
        foreach (var other in components_)
        {
            if (component != other)
                await other.OnCloseAsync();
        }
    }
}
